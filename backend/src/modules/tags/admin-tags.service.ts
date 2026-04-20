import { Injectable } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { AuditService } from '../../common/audit/audit.service';
import { ErrorCode } from '../../common/errors/error-code';
import { ConflictDomainException, NotFoundDomainException } from '../../common/errors/problem.dto';
import { decodeCursor, encodeCursor } from '../../common/pagination/cursor';
import { resolvePageSize } from '../../common/pagination/list-query.dto';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { JobsProducer } from '../jobs/jobs.producer';
import { AdminTagDto, ListTagsQueryDto, MergeTagsDto, UpdateTagDto } from './dto/admin-tag.dto';
import { TagsService } from './tags.service';

@Injectable()
export class AdminTagsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly producer: JobsProducer,
    private readonly tags: TagsService,
  ) {}

  async list(query: ListTagsQueryDto) {
    const limit = resolvePageSize(query.limit);
    const cursor = decodeCursor(query.cursor ?? null);
    const where: Prisma.TagWhereInput = {};
    if (query.q) {
      where.OR = [
        { slug: { contains: query.q.toLowerCase() } },
        { displayName: { contains: query.q, mode: 'insensitive' } },
      ];
    }
    if (query.minUsage != null || query.maxUsage != null) {
      where.usage = {
        is: {
          usageCount: {
            ...(query.minUsage != null ? { gte: query.minUsage } : {}),
            ...(query.maxUsage != null ? { lte: query.maxUsage } : {}),
          },
        },
      };
    }
    const rows = await this.prisma.tag.findMany({
      where,
      include: { usage: true },
      orderBy: [{ displayName: 'asc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor.id } } : {}),
    });
    const hasMore = rows.length > limit;
    const slice = rows.slice(0, limit);
    return {
      items: slice.map((r) => this.toDto(r)),
      pageInfo: {
        nextCursor:
          hasMore && slice.length
            ? encodeCursor({
                id: slice[slice.length - 1].id,
                createdAt: slice[slice.length - 1].createdAt.toISOString(),
              })
            : null,
        hasMore,
      },
    };
  }

  async merge(admin: User, dto: MergeTagsDto): Promise<void> {
    if (dto.fromTagIds.includes(dto.intoTagId)) {
      throw new ConflictDomainException(ErrorCode.TAG_IN_USE, 'Cannot merge a tag into itself.');
    }
    const target = await this.prisma.tag.findUnique({ where: { id: dto.intoTagId } });
    if (!target)
      throw new NotFoundDomainException(
        ErrorCode.TAG_IN_USE,
        `Target tag ${dto.intoTagId} not found.`,
      );
    const sources = await this.prisma.tag.findMany({ where: { id: { in: dto.fromTagIds } } });
    if (sources.length !== dto.fromTagIds.length) {
      throw new NotFoundDomainException(
        ErrorCode.TAG_IN_USE,
        'One or more source tags were not found.',
      );
    }
    const touchedAssets = new Set<string>();
    await this.prisma.$transaction(async (tx) => {
      for (const src of sources) {
        const rows = await tx.assetTag.findMany({
          where: { tagId: src.id },
          select: { assetId: true },
        });
        for (const r of rows) touchedAssets.add(r.assetId);
        // Move every AssetTag from src → target, dedupe if already tagged.
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO asset_tags ("assetId", "tagId")
          SELECT "assetId", ${target.id} FROM asset_tags WHERE "tagId" = ${src.id}
          ON CONFLICT ("assetId", "tagId") DO NOTHING
        `);
        await tx.assetTag.deleteMany({ where: { tagId: src.id } });
        await tx.tagUsage.deleteMany({ where: { tagId: src.id } }).catch(() => undefined);
        await tx.tag.delete({ where: { id: src.id } });
      }
    });
    await Promise.all(
      Array.from(touchedAssets).map((id) =>
        this.producer.enqueueSearchIndex({ reason: 'asset.update', assetId: id }),
      ),
    );
    await this.tags.invalidatePopularCache();
    await this.audit.record({
      actorId: admin.id,
      action: 'tag.merge',
      subjectType: 'Tag',
      subjectId: target.id,
      metadata: { fromTagIds: dto.fromTagIds, touched: touchedAssets.size },
    });
  }

  async update(id: string, admin: User, dto: UpdateTagDto): Promise<AdminTagDto> {
    const row = await this.prisma.tag.findUnique({ where: { id } });
    if (!row) throw new NotFoundDomainException(ErrorCode.TAG_IN_USE, `Tag ${id} not found.`);
    if (dto.slug && dto.slug !== row.slug) {
      const collision = await this.prisma.tag.findUnique({ where: { slug: dto.slug } });
      if (collision) {
        throw new ConflictDomainException(
          ErrorCode.TAG_IN_USE,
          `Slug "${dto.slug}" is already in use.`,
        );
      }
    }
    const updated = await this.prisma.tag.update({
      where: { id },
      data: {
        slug: dto.slug ?? row.slug,
        displayName: dto.displayName ?? row.displayName,
      },
      include: { usage: true },
    });
    // Tag rename → ripple every asset using it through the search indexer.
    const assets = await this.prisma.assetTag.findMany({
      where: { tagId: id },
      select: { assetId: true },
    });
    await Promise.all(
      assets.map((a) =>
        this.producer.enqueueSearchIndex({ reason: 'asset.update', assetId: a.assetId }),
      ),
    );
    await this.tags.invalidatePopularCache();
    await this.audit.record({
      actorId: admin.id,
      action: 'tag.update',
      subjectType: 'Tag',
      subjectId: id,
      metadata: { changes: dto },
    });
    return this.toDto(updated);
  }

  async remove(id: string, admin: User): Promise<void> {
    const usage = await this.prisma.assetTag.count({ where: { tagId: id } });
    if (usage > 0) {
      throw new ConflictDomainException(
        ErrorCode.TAG_IN_USE,
        `Tag is used by ${usage} asset(s) — merge or untag first.`,
      );
    }
    const row = await this.prisma.tag.findUnique({ where: { id } });
    if (!row) throw new NotFoundDomainException(ErrorCode.TAG_IN_USE, `Tag ${id} not found.`);
    await this.prisma.tag.delete({ where: { id } });
    await this.tags.invalidatePopularCache();
    await this.audit.record({
      actorId: admin.id,
      action: 'tag.delete',
      subjectType: 'Tag',
      subjectId: id,
      metadata: { slug: row.slug },
    });
  }

  private toDto(row: {
    id: string;
    slug: string;
    displayName: string;
    createdAt: Date;
    usage?: { usageCount: number } | null;
  }): AdminTagDto {
    return {
      id: row.id,
      slug: row.slug,
      displayName: row.displayName,
      usageCount: row.usage?.usageCount ?? 0,
      createdAt: row.createdAt.toISOString(),
    };
  }
}

import { Injectable } from '@nestjs/common';
import { Category, Prisma, User } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../../common/audit/audit.service';
import { ErrorCode } from '../../common/errors/error-code';
import {
  BadRequestDomainException,
  ConflictDomainException,
  NotFoundDomainException,
} from '../../common/errors/problem.dto';
import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { S3Service } from '../../infra/s3/s3.service';
import { JobsProducer } from '../jobs/jobs.producer';
import { CategoriesService } from './categories.service';
import { AdminCategoryDto, CreateCategoryDto, UpdateCategoryDto } from './dto/admin-category.dto';

const ICON_MAX_BYTES = 256 * 1024;

@Injectable()
export class AdminCategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly producer: JobsProducer,
    private readonly audit: AuditService,
    private readonly categories: CategoriesService,
    private readonly config: AppConfigService,
  ) {}

  async list(): Promise<AdminCategoryDto[]> {
    const rows = await this.prisma.category.findMany({
      orderBy: [{ isActive: 'desc' }, { sortOrder: 'asc' }],
      include: { _count: { select: { assets: true } } },
    });
    return Promise.all(rows.map((r) => this.toDto(r)));
  }

  async create(admin: User, dto: CreateCategoryDto): Promise<AdminCategoryDto> {
    const existing = await this.prisma.category.findUnique({ where: { slug: dto.slug } });
    if (existing) {
      throw new ConflictDomainException(
        ErrorCode.CATEGORY_IN_USE,
        `Category slug "${dto.slug}" already exists.`,
      );
    }
    const row = await this.prisma.category.create({
      data: {
        slug: dto.slug,
        name: dto.name as Prisma.InputJsonValue,
        iconKey: dto.iconKey,
        sortOrder: dto.sortOrder ?? 999,
        isActive: dto.isActive ?? true,
      },
      include: { _count: { select: { assets: true } } },
    });
    await this.categories.invalidateCache();
    await this.audit.record({
      actorId: admin.id,
      action: 'category.create',
      subjectType: 'Category',
      subjectId: row.id,
      metadata: { slug: dto.slug },
    });
    return this.toDto(row);
  }

  async update(id: string, admin: User, dto: UpdateCategoryDto): Promise<AdminCategoryDto> {
    const existing = await this.prisma.category.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundDomainException(ErrorCode.CATEGORY_NOT_FOUND, `Category ${id} not found.`);
    }
    if (dto.slug && dto.slug !== existing.slug) {
      const collision = await this.prisma.category.findUnique({ where: { slug: dto.slug } });
      if (collision) {
        throw new ConflictDomainException(
          ErrorCode.CATEGORY_IN_USE,
          `Slug "${dto.slug}" is taken.`,
        );
      }
    }
    const mergedName =
      dto.name == null
        ? (existing.name as Prisma.InputJsonValue)
        : ({
            ...((existing.name as Record<string, string>) ?? {}),
            ...dto.name,
          } as Prisma.InputJsonValue);
    const row = await this.prisma.category.update({
      where: { id },
      data: {
        slug: dto.slug ?? existing.slug,
        name: mergedName,
        iconKey: dto.iconKey ?? existing.iconKey,
        sortOrder: dto.sortOrder ?? existing.sortOrder,
        isActive: dto.isActive ?? existing.isActive,
      },
      include: { _count: { select: { assets: true } } },
    });
    await this.categories.invalidateCache();
    await this.audit.record({
      actorId: admin.id,
      action: 'category.update',
      subjectType: 'Category',
      subjectId: id,
      metadata: { changes: dto },
    });
    // Rename / sort changes affect search labels — queue a per-asset reindex
    // for everything in this category.
    await this.reindexCategoryAssets(id);
    return this.toDto(row);
  }

  async remove(id: string, admin: User): Promise<void> {
    const usage = await this.prisma.asset.count({ where: { categoryId: id } });
    if (usage > 0) {
      throw new ConflictDomainException(
        ErrorCode.CATEGORY_IN_USE,
        `Category has ${usage} asset(s) — reassign them before deleting.`,
      );
    }
    const row = await this.prisma.category.findUnique({ where: { id } });
    if (!row)
      throw new NotFoundDomainException(ErrorCode.CATEGORY_NOT_FOUND, `Category ${id} not found.`);
    await this.prisma.category.delete({ where: { id } });
    await this.categories.invalidateCache();
    await this.audit.record({
      actorId: admin.id,
      action: 'category.delete',
      subjectType: 'Category',
      subjectId: id,
      metadata: { slug: row.slug },
    });
  }

  async reorder(orderedIds: string[], admin: User): Promise<void> {
    await this.prisma.$transaction(
      orderedIds.map((id, idx) =>
        this.prisma.category.update({ where: { id }, data: { sortOrder: idx } }),
      ),
    );
    await this.categories.invalidateCache();
    await this.audit.record({
      actorId: admin.id,
      action: 'category.reorder',
      subjectType: 'Category',
      subjectId: 'reorder',
      metadata: { orderedIds },
    });
  }

  async initiateIconUpload(
    contentType: string,
    bytes: number,
  ): Promise<{ putUrl: string; key: string; expiresAt: string }> {
    if (bytes > ICON_MAX_BYTES) {
      throw new BadRequestDomainException(
        ErrorCode.FILE_UPLOAD_INIT_FAILED,
        `Icon must be ≤ ${ICON_MAX_BYTES} bytes.`,
      );
    }
    const key = `category-icons/${randomUUID()}`;
    const presigned = await this.s3.presignPut('thumbs', key, contentType);
    return {
      putUrl: presigned.url,
      key,
      expiresAt: new Date(
        Date.now() + this.config.get('S3_PRESIGN_EXPIRES_SEC') * 1000,
      ).toISOString(),
    };
  }

  private async reindexCategoryAssets(categoryId: string): Promise<void> {
    const assets = await this.prisma.asset.findMany({
      where: { categoryId, status: 'PUBLISHED' },
      select: { id: true },
      take: 5000,
    });
    await Promise.all(
      assets.map((a) =>
        this.producer.enqueueSearchIndex({ reason: 'asset.update', assetId: a.id }),
      ),
    );
  }

  private async toDto(
    row: Category & { iconKey?: string | null; _count: { assets: number } },
  ): Promise<AdminCategoryDto> {
    return {
      id: row.id,
      slug: row.slug,
      name: (row.name as { en?: string; id?: string }) ?? {},
      iconKey: row.iconKey ?? undefined,
      iconUrl: row.iconKey ? await this.s3.presignGet('thumbs', row.iconKey) : undefined,
      sortOrder: row.sortOrder,
      isActive: row.isActive,
      assetCount: row._count.assets,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

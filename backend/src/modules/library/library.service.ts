import { Injectable } from '@nestjs/common';
import { Locale, Prisma, User } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code';
import { NotFoundDomainException } from '../../common/errors/problem.dto';
import { decodeCursor, encodeCursor } from '../../common/pagination/cursor';
import { resolvePageSize } from '../../common/pagination/list-query.dto';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AssetMapperService } from '../assets/asset-mapper.service';
import { ListLibraryQueryDto, LibraryItemDto } from './dto/library.dto';

const LIBRARY_INCLUDE = {
  asset: {
    include: {
      owner: true,
      category: true,
      license: true,
      translations: true,
      tags: { include: { tag: true } },
      versions: { include: { files: true, compatibility: true, dependencies: true } },
      _count: { select: { libraryItems: true, downloads: true } },
    },
  },
} satisfies Prisma.LibraryItemInclude;

@Injectable()
export class LibraryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mapper: AssetMapperService,
  ) {}

  async list(
    user: User,
    query: ListLibraryQueryDto,
    locale: Locale,
  ): Promise<{
    items: LibraryItemDto[];
    pageInfo: { nextCursor: string | null; hasMore: boolean };
  }> {
    const limit = resolvePageSize(query.limit);
    const cursor = decodeCursor(query.cursor ?? null);

    const where: Prisma.LibraryItemWhereInput = { userId: user.id, asset: { status: 'PUBLISHED' } };
    if (query.hidden === 'true') where.hidden = true;
    else if (query.hidden !== 'all') where.hidden = false;

    if (query.q) {
      where.asset = {
        ...(where.asset as Prisma.AssetWhereInput),
        OR: [
          { title: { contains: query.q, mode: 'insensitive' } },
          { tags: { some: { tag: { displayName: { contains: query.q, mode: 'insensitive' } } } } },
        ],
      };
    }
    if (query.categoryIds?.length) {
      where.asset = {
        ...(where.asset as Prisma.AssetWhereInput),
        categoryId: { in: query.categoryIds },
      };
    }
    if (query.tags?.length) {
      where.asset = {
        ...(where.asset as Prisma.AssetWhereInput),
        tags: { some: { tag: { slug: { in: query.tags } } } },
      };
    }
    if (query.engine) {
      where.asset = { ...(where.asset as Prisma.AssetWhereInput), engine: query.engine };
    }

    const orderBy: Prisma.LibraryItemOrderByWithRelationInput[] =
      query.sort === 'alphabetical'
        ? [{ asset: { title: 'asc' } }, { id: 'desc' }]
        : query.sort === 'recentlyUpdated'
          ? [{ asset: { updatedAt: 'desc' } }, { id: 'desc' }]
          : [{ addedAt: 'desc' }, { id: 'desc' }];

    const rows = await this.prisma.libraryItem.findMany({
      where,
      include: LIBRARY_INCLUDE,
      take: limit + 1,
      orderBy,
      ...(cursor ? { skip: 1, cursor: { id: cursor.id } } : {}),
    });
    const hasMore = rows.length > limit;
    const itemsRaw = rows.slice(0, limit);
    const assetSummaries = await this.mapper.toSummaryMany(
      itemsRaw.map((row) => row.asset),
      locale,
    );
    const items: LibraryItemDto[] = itemsRaw.map((row, i) => ({
      addedAt: row.addedAt.toISOString(),
      hidden: row.hidden,
      asset: assetSummaries[i],
    }));
    const last = itemsRaw[itemsRaw.length - 1];
    const nextCursor =
      hasMore && last ? encodeCursor({ id: last.id, createdAt: last.addedAt.toISOString() }) : null;
    return { items, pageInfo: { nextCursor, hasMore } };
  }

  async add(user: User, assetId: string): Promise<void> {
    const asset = await this.prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset)
      throw new NotFoundDomainException(ErrorCode.ASSET_NOT_FOUND, `Asset ${assetId} not found.`);
    await this.prisma.libraryItem.upsert({
      where: { userId_assetId: { userId: user.id, assetId } },
      create: { userId: user.id, assetId },
      update: { hidden: false },
    });
  }

  async remove(user: User, assetId: string): Promise<void> {
    await this.prisma.libraryItem.deleteMany({ where: { userId: user.id, assetId } });
  }

  async setHidden(user: User, assetId: string, hidden: boolean): Promise<void> {
    const row = await this.prisma.libraryItem.findUnique({
      where: { userId_assetId: { userId: user.id, assetId } },
    });
    if (!row) throw new NotFoundDomainException(ErrorCode.ASSET_NOT_FOUND, 'Item not in library.');
    await this.prisma.libraryItem.update({
      where: { userId_assetId: { userId: user.id, assetId } },
      data: { hidden },
    });
  }
}

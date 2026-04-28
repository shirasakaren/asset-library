import { Injectable } from '@nestjs/common';
import { AssetStatus, Locale, Prisma, User } from '@prisma/client';
import { decodeCursor, encodeCursor } from '../../common/pagination/cursor';
import { resolvePageSize } from '../../common/pagination/list-query.dto';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AssetMapperService } from './asset-mapper.service';
import { AssetsService } from './assets.service';
import { AssetSummaryDto } from './dto/asset.dto';
import { AssetSort, ListAssetsQueryDto } from './dto/list-assets-query.dto';

export interface AssetListResult {
  items: AssetSummaryDto[];
  pageInfo: { nextCursor: string | null; hasMore: boolean };
  total?: number;
}

const LIST_INCLUDE = {
  owner: true,
  category: true,
  license: true,
  translations: true,
  tags: { include: { tag: true } },
  versions: { include: { files: true, compatibility: true, dependencies: true } },
  _count: { select: { libraryItems: true, downloads: true } },
} satisfies Prisma.AssetInclude;

/**
 * The `?q=` path delegates to Meilisearch (Part 2 §6.5); this Postgres-only
 * lister handles every other filter combo and is the source of pagination
 * truth for cursor-based scrolls.
 */
@Injectable()
export class AssetsListService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assets: AssetsService,
    private readonly mapper: AssetMapperService,
  ) {}

  async listFromPostgres(
    query: ListAssetsQueryDto,
    requester: User | null,
    locale: Locale,
  ): Promise<AssetListResult> {
    const limit = resolvePageSize(query.limit);
    const cursor = decodeCursor(query.cursor ?? null);

    const statuses: AssetStatus[] =
      query.includeUnpublished && requester?.isAdmin
        ? ['DRAFT', 'PUBLISHED', 'ARCHIVED']
        : query.ownerId && requester && (requester.id === query.ownerId || requester.isAdmin)
          ? ['DRAFT', 'PUBLISHED', 'ARCHIVED']
          : ['PUBLISHED'];

    const where = this.assets.buildWhere({
      engine: query.engine,
      categoryIds: query.categoryIds,
      tagSlugs: query.tags,
      fileKinds: query.fileKinds,
      licenseSlug: query.licenseSlug,
      renderPipelines: query.renderPipelines,
      targets: query.targets,
      ownerId: query.ownerId,
      statuses,
    });

    const orderBy = this.buildOrderBy(query.sort ?? 'newest');

    const rows = await this.prisma.asset.findMany({
      where,
      orderBy,
      include: LIST_INCLUDE,
      take: limit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor.id } } : {}),
    });
    const hasMore = rows.length > limit;
    const items = await this.mapper.toSummaryMany(rows.slice(0, limit), locale);
    const last = rows[items.length - 1];
    const nextCursor =
      hasMore && last
        ? encodeCursor({ id: last.id, createdAt: last.createdAt.toISOString() })
        : null;
    return { items, pageInfo: { nextCursor, hasMore } };
  }

  /**
   * Hydrate a list of asset ids in their incoming order (the Meilisearch path
   * uses this). Skips assets the requester is not allowed to see.
   */
  async hydrate(
    ids: string[],
    _requester: User | null,
    locale: Locale,
  ): Promise<AssetSummaryDto[]> {
    if (ids.length === 0) return [];
    const rows = await this.prisma.asset.findMany({
      where: { id: { in: ids }, status: 'PUBLISHED' },
      include: LIST_INCLUDE,
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    const ordered = ids
      .map((id) => byId.get(id))
      .filter((r): r is NonNullable<typeof r> => Boolean(r));
    return this.mapper.toSummaryMany(ordered, locale);
  }

  private buildOrderBy(sort: AssetSort): Prisma.AssetOrderByWithRelationInput[] {
    switch (sort) {
      case 'newest':
        return [
          { publishedAt: { sort: 'desc', nulls: 'last' } },
          { createdAt: 'desc' },
          { id: 'desc' },
        ];
      case 'mostDownloaded':
        return [{ downloads: { _count: 'desc' } }, { id: 'desc' }];
      case 'mostSaved':
        return [{ libraryItems: { _count: 'desc' } }, { id: 'desc' }];
      case 'recentlyUpdated':
        return [{ updatedAt: 'desc' }, { id: 'desc' }];
      case 'alphabetical':
        return [{ title: 'asc' }, { id: 'desc' }];
    }
  }
}

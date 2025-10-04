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


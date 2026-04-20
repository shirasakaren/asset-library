import { Injectable } from '@nestjs/common';
import { Category, Locale } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code';
import { NotFoundDomainException } from '../../common/errors/problem.dto';
import { resolveLocalized, LocalizedJson } from '../../common/i18n/locale-resolver';
import { CachedService } from '../../infra/redis/cached.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { CategoryDto } from './dto/category.dto';

const CACHE_KEY = (locale: Locale) => `cache:categories:v1:locale:${locale}`;
// 10 min: categories are admin-managed and change on a weekly timescale at
// most. Admin mutations call `invalidateCache()` so on-demand staleness is
// bounded by the TTL only when invalidation itself fails.
const CACHE_TTL_SECONDS = 600;

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cached: CachedService,
  ) {}

  async findByIdOrThrow(id: string): Promise<Category> {
    const row = await this.prisma.category.findUnique({ where: { id } });
    if (!row)
      throw new NotFoundDomainException(ErrorCode.CATEGORY_NOT_FOUND, `Category ${id} not found.`);
    return row;
  }

  /**
   * Lists active categories with per-category `assetCount`. Result is cached
   * in Redis for 10 minutes per locale; admin mutations call `invalidateCache`.
   */
  async list(locale: Locale): Promise<CategoryDto[]> {
    return this.cached.getOrFetch<CategoryDto[]>(CACHE_KEY(locale), CACHE_TTL_SECONDS, () =>
      this.computeList(locale),
    );
  }

  private async computeList(locale: Locale): Promise<CategoryDto[]> {
    const rows = await this.prisma.category.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    const counts = await this.prisma.asset.groupBy({
      by: ['categoryId'],
      where: { status: 'PUBLISHED' },
      _count: { _all: true },
    });
    const countByCategory = new Map(counts.map((c) => [c.categoryId, c._count._all]));

    return rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: resolveLocalized(row.name as LocalizedJson, locale) ?? row.slug,
      iconKey: row.iconKey ?? undefined,
      sortOrder: row.sortOrder,
      assetCount: countByCategory.get(row.id) ?? 0,
    }));
  }

  /** Drops the cached listings — call after an asset's category/publish state changes. */
  async invalidateCache(): Promise<void> {
    await this.cached.invalidate(CACHE_KEY('en'), CACHE_KEY('id'));
  }
}

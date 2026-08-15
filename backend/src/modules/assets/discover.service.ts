import { Injectable } from '@nestjs/common';
import { Locale, Prisma } from '@prisma/client';
import { LocalizedJson, resolveLocalized } from '../../common/i18n/locale-resolver';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RedisService } from '../../infra/redis/redis.service';
import { S3Service } from '../../infra/s3/s3.service';
import { AssetMapperService } from './asset-mapper.service';
import { AssetSummaryDto } from './dto/asset.dto';

export interface DiscoverFeaturedDto {
  id: string;
  assetId: string;
  assetSlug: string;
  title: string;
  shortDescription: string;
  bannerUrl: string | null;
  sortOrder: number;
}

export interface DiscoverRowDto {
  categoryId: string;
  categorySlug: string;
  name: string;
  assets: AssetSummaryDto[];
}

export interface DiscoverResponseDto {
  featured: DiscoverFeaturedDto[];
  rows: DiscoverRowDto[];
}

const CACHE_KEY = (locale: Locale) => `discover:${locale}`;
const CACHE_TTL = 30;
const FEATURED_LIMIT = 5;
const ASSETS_PER_ROW = 8;

const LIST_INCLUDE = {
  owner: true,
  category: true,
  license: true,
  translations: true,
  tags: { include: { tag: true } },
  versions: { include: { files: true, compatibility: true, dependencies: true } },
  _count: { select: { libraryItems: true, downloads: true } },
};

/**
 * Builds the one-request payload powering the Discover page. Cached in Redis
 * for 30 s per locale; cache is implicitly refreshed when entries expire.
 */
@Injectable()
export class DiscoverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly s3: S3Service,
    private readonly mapper: AssetMapperService,
  ) {}

  async get(locale: Locale): Promise<DiscoverResponseDto> {
    const cached = await this.redis.client.get(CACHE_KEY(locale));
    if (cached) return JSON.parse(cached) as DiscoverResponseDto;

    const [featuredRows, categories] = await Promise.all([
      this.prisma.featuredSlot.findMany({
        where: { isActive: true },
        include: { asset: { include: { translations: true } } },
        orderBy: { sortOrder: 'asc' },
        take: FEATURED_LIMIT,
      }),
      this.prisma.category.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }),
    ]);

    const featured: DiscoverFeaturedDto[] = await Promise.all(
      featuredRows.map(async (slot) => {
        const assetTranslation =
          slot.asset.translations.find((t) => t.locale === locale) ?? slot.asset.translations[0];
        const customShort = resolveLocalized<string>(
          slot.customShortDescription as LocalizedJson | null,
          locale,
        );
        const bannerKey = slot.customBannerKey ?? slot.asset.thumbnailKey;
        const bannerRole = slot.customBannerKey ? 'thumbs' : 'thumbs';
        return {
          id: slot.id,
          assetId: slot.assetId,
          assetSlug: slot.asset.slug,
          title: slot.customTitle ?? slot.asset.title,
          shortDescription: customShort ?? assetTranslation?.shortDescription ?? '',
          bannerUrl: bannerKey ? await this.s3.presignGet(bannerRole, bannerKey) : null,
          sortOrder: slot.sortOrder,
        };
      }),
    );

    const rows = await this.buildRows(categories, locale);

    const payload: DiscoverResponseDto = { featured, rows };
    await this.redis.client.set(CACHE_KEY(locale), JSON.stringify(payload), 'EX', CACHE_TTL);
    return payload;
  }

  /**
   * Builds the per-category rows in two queries instead of one per category.
   *
   * 1. A single CTE ranks PUBLISHED assets per category by
   *    `publishedAt DESC, id DESC` and keeps the top `ASSETS_PER_ROW` ids.
   * 2. One `findMany({ id: { in } })` hydrates the full rows + relations.
   *
   * The previous shape ran one `findMany` per active category (~10), so a
   * cold Discover load cost ~40–50 SQL roundtrips. This caps it at ~2.
   * Category order, per-row asset order, and the `ASSETS_PER_ROW` cap are
   * preserved exactly; empty categories are dropped just like before.
   */
  private async buildRows(
    categories: Array<{ id: string; slug: string; name: unknown }>,
    locale: Locale,
  ): Promise<DiscoverRowDto[]> {
    if (categories.length === 0) return [];
    const categoryIds = categories.map((c) => c.id);

    // Window-function CTE: top N published assets per category in one shot.
    // Selecting only ids keeps the planned rows small; the join-heavy
    // hydration runs once below via Prisma's batched relation queries.
    const ranked = await this.prisma.$queryRaw<Array<{ id: string; categoryId: string }>>(
      Prisma.sql`
        WITH ranked AS (
          SELECT
            a.id,
            a."categoryId",
            ROW_NUMBER() OVER (
              PARTITION BY a."categoryId"
              ORDER BY a."publishedAt" DESC NULLS LAST, a.id DESC
            ) AS rn
          FROM assets a
          WHERE a.status = 'PUBLISHED'
            AND a."categoryId" = ANY(${categoryIds}::text[])
        )
        SELECT id, "categoryId"
        FROM ranked
        WHERE rn <= ${ASSETS_PER_ROW}
      `,
    );
    if (ranked.length === 0) return [];

    const rowAssets = await this.prisma.asset.findMany({
      where: { id: { in: ranked.map((r) => r.id) } },
      include: LIST_INCLUDE,
    });
    const assetById = new Map(rowAssets.map((a) => [a.id, a]));

    // Re-group while preserving the CTE's per-category ordering. The CTE
    // does not guarantee row order at the outer SELECT (Postgres is free to
    // reorder), so sort each group's ids by (publishedAt DESC, id DESC) to
    // match the previous per-category `orderBy` exactly.
    const idsByCategory = new Map<string, string[]>();
    for (const r of ranked) {
      const list = idsByCategory.get(r.categoryId);
      if (list) list.push(r.id);
      else idsByCategory.set(r.categoryId, [r.id]);
    }
    for (const ids of idsByCategory.values()) {
      ids.sort((a, b) => {
        const aa = assetById.get(a);
        const bb = assetById.get(b);
        if (!aa || !bb) return 0;
        const ap = aa.publishedAt?.getTime() ?? 0;
        const bp = bb.publishedAt?.getTime() ?? 0;
        if (ap !== bp) return bp - ap;
        return a < b ? 1 : a > b ? -1 : 0;
      });
    }

    // Single batched presign + DTO mapping across every row's assets, so we
    // don't pay the per-category `toSummaryMany` cost (one S3 round-trip per
    // call). Flatten → map once → split back into the per-category buckets.
    const orderedFlat: Array<{ catId: string; assetId: string }> = [];
    for (const cat of categories) {
      const ids = idsByCategory.get(cat.id);
      if (!ids || ids.length === 0) continue;
      for (const id of ids) orderedFlat.push({ catId: cat.id, assetId: id });
    }
    const flatAssets = orderedFlat
      .map((p) => assetById.get(p.assetId))
      .filter((a): a is NonNullable<typeof a> => Boolean(a));
    const summaries = await this.mapper.toSummaryMany(flatAssets, locale);
    const summariesByCategory = new Map<string, AssetSummaryDto[]>();
    orderedFlat.forEach((p, i) => {
      const bucket = summariesByCategory.get(p.catId);
      const s = summaries[i];
      if (!s) return;
      if (bucket) bucket.push(s);
      else summariesByCategory.set(p.catId, [s]);
    });

    const rows: DiscoverRowDto[] = [];
    for (const cat of categories) {
      const assets = summariesByCategory.get(cat.id);
      if (!assets || assets.length === 0) continue;
      rows.push({
        categoryId: cat.id,
        categorySlug: cat.slug,
        name: resolveLocalized(cat.name as LocalizedJson, locale) ?? cat.slug,
        assets,
      });
    }
    return rows;
  }

  async invalidate(): Promise<void> {
    await Promise.all([
      this.redis.client.del(CACHE_KEY('en')),
      this.redis.client.del(CACHE_KEY('id')),
    ]);
  }
}

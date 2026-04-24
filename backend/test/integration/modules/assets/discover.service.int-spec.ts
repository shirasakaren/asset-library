import { Locale } from '@prisma/client';
import { DiscoverService } from '../../../../src/modules/assets/discover.service';

/**
 * Integration-level test for the batched Discover row builder. The repo has no
 * Postgres-backed integration harness yet (only Jest unit + a Docker-only e2e
 * suite), so this asserts the JS-side behavior of the new shape against fake
 * Prisma / Redis / S3 / Mapper collaborators:
 *
 *   - Exactly ONE `$queryRaw` is issued for ranking (the CTE) and ONE
 *     `asset.findMany` for hydration, regardless of category count (kills N+1).
 *   - Each row contains at most ASSETS_PER_ROW (8) assets even when the
 *     underlying data has more.
 *   - Per-row assets are ordered by `publishedAt DESC` then by `id DESC`.
 *   - Category order in the response matches the order in which categories
 *     were passed in.
 *   - Categories with no published assets are dropped (preserving prior
 *     behavior).
 */

const ASSETS_PER_ROW = 8;

type AssetRow = {
  id: string;
  publishedAt: Date | null;
  categoryId: string;
};

function makeAsset(id: string, categoryId: string, publishedAt: Date): AssetRow {
  return { id, publishedAt, categoryId };
}

function makeCategories(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `cat-${i}`,
    slug: `category-${i}`,
    name: { en: `Category ${i}`, id: `Kategori ${i}` },
    isActive: true,
    sortOrder: i,
  }));
}

function makeAssetsForCategory(categoryId: string, count: number): AssetRow[] {
  // publishedAt monotonically decreasing per index so index 0 is newest.
  const base = Date.UTC(2026, 0, 1);
  return Array.from({ length: count }, (_, i) =>
    makeAsset(
      `${categoryId}-asset-${String(i).padStart(3, '0')}`,
      categoryId,
      new Date(base - i * 86_400_000),
    ),
  );
}

interface FakePrisma {
  $queryRaw: jest.Mock;
  asset: { findMany: jest.Mock };
  featuredSlot: { findMany: jest.Mock };
  category: { findMany: jest.Mock };
}

function buildFakePrisma(allAssetsByCategory: Map<string, AssetRow[]>): FakePrisma {
  const queryRaw = jest.fn(async (sql: { values: unknown[] }) => {
    // The CTE's bound params land in `sql.values` in order:
    // [categoryIds: string[], ASSETS_PER_ROW: number]
    const [categoryIds, take] = sql.values as [string[], number];
    const out: Array<{ id: string; categoryId: string }> = [];
    for (const cid of categoryIds) {
      const rows = (allAssetsByCategory.get(cid) ?? [])
        .slice()
        .sort((a, b) => {
          const ap = a.publishedAt?.getTime() ?? 0;
          const bp = b.publishedAt?.getTime() ?? 0;
          if (ap !== bp) return bp - ap;
          return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
        })
        .slice(0, take);
      for (const r of rows) out.push({ id: r.id, categoryId: r.categoryId });
    }
    return out;
  });

  const findMany = jest.fn(async ({ where }: { where: { id: { in: string[] } } }) => {
    const wanted = new Set(where.id.in);
    const rows: AssetRow[] = [];
    for (const arr of allAssetsByCategory.values()) {
      for (const a of arr) if (wanted.has(a.id)) rows.push(a);
    }
    return rows;
  });

  return {
    $queryRaw: queryRaw,
    asset: { findMany },
    featuredSlot: { findMany: jest.fn(async () => []) },
    category: { findMany: jest.fn(async () => []) },
  };
}

function buildService(prisma: FakePrisma): DiscoverService {
  const redis = {
    client: {
      get: jest.fn(async () => null),
      set: jest.fn(async () => 'OK'),
      del: jest.fn(async () => 1),
    },
  };
  const s3 = { presignGet: jest.fn(async (_role: string, key: string) => `signed://${key}`) };
  const mapper = {
    toSummaryMany: jest.fn(async (assets: AssetRow[], _locale: Locale) =>
      // Return ordered DTO shells preserving input order; that's the contract
      // toSummaryMany already provides in production.
      assets.map((a) => ({
        id: a.id,
        slug: `slug-${a.id}`,
        title: `title-${a.id}`,
        shortDescription: '',
        engine: 'UNITY',
        status: 'PUBLISHED',
        ownerDisplayName: 'someone',
        categoryName: a.categoryId,
        totalDownloads: 0,
        totalSaves: 0,
        updatedAt: new Date().toISOString(),
        publishedAt: a.publishedAt?.toISOString(),
      })),
    ),
  };

  // `as never` casts because the production constructor expects fully typed
  // injected services; these fakes match the surface the service actually
  // uses, which is what we care about here.
  return new DiscoverService(prisma as never, redis as never, s3 as never, mapper as never);
}

describe('DiscoverService (integration: batched rows)', () => {
  it('returns one row per non-empty category with at most ASSETS_PER_ROW assets each, ordered by publishedAt DESC', async () => {
    const CATEGORY_COUNT = 10;
    const ASSETS_PER_CAT = 20; // > ASSETS_PER_ROW so we exercise the cap
    const categories = makeCategories(CATEGORY_COUNT);
    const byCat = new Map<string, AssetRow[]>();
    for (const c of categories) byCat.set(c.id, makeAssetsForCategory(c.id, ASSETS_PER_CAT));

    const prisma = buildFakePrisma(byCat);
    prisma.category.findMany.mockResolvedValueOnce(categories);

    const service = buildService(prisma);
    const result = await service.get('en');

    // Exactly one batched ranking query + one hydration query, regardless of
    // category count. This is the whole point of the fix.
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.asset.findMany).toHaveBeenCalledTimes(1);

    // One row per category (all categories have data), in input order.
    expect(result.rows).toHaveLength(CATEGORY_COUNT);
    expect(result.rows.map((r) => r.categoryId)).toEqual(categories.map((c) => c.id));

    for (const row of result.rows) {
      expect(row.assets.length).toBeLessThanOrEqual(ASSETS_PER_ROW);
      expect(row.assets.length).toBe(ASSETS_PER_ROW);

      // publishedAt DESC: each subsequent asset has timestamp <= previous.
      const timestamps = row.assets.map((a) => new Date(a.publishedAt ?? 0).getTime());
      const sorted = [...timestamps].sort((a, b) => b - a);
      expect(timestamps).toEqual(sorted);
    }
  });

  it('drops categories with no published assets and preserves order for the rest', async () => {
    const categories = makeCategories(4);
    const byCat = new Map<string, AssetRow[]>();
    // cat-0 and cat-2 have data; cat-1 and cat-3 are empty.
    byCat.set('cat-0', makeAssetsForCategory('cat-0', 3));
    byCat.set('cat-1', []);
    byCat.set('cat-2', makeAssetsForCategory('cat-2', 5));
    byCat.set('cat-3', []);

    const prisma = buildFakePrisma(byCat);
    prisma.category.findMany.mockResolvedValueOnce(categories);

    const service = buildService(prisma);
    const result = await service.get('en');

    expect(result.rows.map((r) => r.categoryId)).toEqual(['cat-0', 'cat-2']);
    expect(result.rows[0].assets).toHaveLength(3);
    expect(result.rows[1].assets).toHaveLength(5);
  });

  it('caps each row at ASSETS_PER_ROW even when many more rows match', async () => {
    const categories = makeCategories(1);
    const byCat = new Map<string, AssetRow[]>();
    byCat.set('cat-0', makeAssetsForCategory('cat-0', 100));

    const prisma = buildFakePrisma(byCat);
    prisma.category.findMany.mockResolvedValueOnce(categories);

    const service = buildService(prisma);
    const result = await service.get('en');

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].assets).toHaveLength(ASSETS_PER_ROW);

    // The retained assets are the 8 newest by publishedAt.
    const ids = result.rows[0].assets.map((a) => a.id);
    const expected = Array.from(
      { length: ASSETS_PER_ROW },
      (_, i) => `cat-0-asset-${String(i).padStart(3, '0')}`,
    );
    expect(ids).toEqual(expected);
  });

  it('returns no rows (but still a well-formed payload) when there are no categories', async () => {
    const prisma = buildFakePrisma(new Map());
    prisma.category.findMany.mockResolvedValueOnce([]);

    const service = buildService(prisma);
    const result = await service.get('en');

    expect(result).toEqual({ featured: [], rows: [] });
    // No CTE or hydration needed when there are no categories to rank.
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(prisma.asset.findMany).not.toHaveBeenCalled();
  });
});

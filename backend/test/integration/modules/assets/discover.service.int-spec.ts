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

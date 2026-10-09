import { beforeAll, describe, expect, it } from 'vitest';
import { createSeededTestApp, type TestApp } from '@/preview/test-utils';
import type { AssetRecord, LibraryRecord } from '@/preview/records';
import type {
  AssetDetail,
  AssetListPage,
  AssetSummary,
  Category,
  DiscoverResponse,
  LibraryPage,
  MeResponse,
  SearchAssetsResponse,
} from '@/lib/api/types';

// Smoke suite over the REAL committed seed JSON.
describe('catalog handlers over the real seed', () => {
  let app: TestApp;
  let published: AssetRecord[];

  beforeAll(async () => {
    app = await createSeededTestApp();
    published = (await app.db.list<AssetRecord>('assets')).filter((a) => a.status === 'PUBLISHED');
  });

  it('/categories returns 10 categories whose counts add up to the PUBLISHED assets', async () => {
    const cats = await app.call<Category[]>('GET', '/categories');
    expect(cats).toHaveLength(10);
    expect(cats.reduce((n, c) => n + c.assetCount, 0)).toBe(published.length);
    expect(cats.map((c) => c.sortOrder)).toEqual(
      [...cats.map((c) => c.sortOrder)].sort((a, b) => a - b),
    );
    const id = await app.call<Category[]>('GET', '/categories', { locale: 'id' });
    expect(id.find((c) => c.slug === '3d-models')!.name).toBe('Model 3D');
  });

  it('/discover has 5 featured slots and non-empty rows of at most 12 assets with /thumbs/ urls', async () => {
    const d = await app.call<DiscoverResponse>('GET', '/discover');
    expect(d.featured.map((f) => f.sortOrder)).toEqual([1, 2, 3, 4, 5]);
    for (const f of d.featured) expect(f.bannerUrl).toMatch(/^\/thumbs\//);
    expect(d.rows.length).toBe(10);
    for (const row of d.rows) {
      expect(row.assets.length).toBeGreaterThan(0);
      expect(row.assets.length).toBeLessThanOrEqual(12);
      for (const a of row.assets) {
        expect(a.thumbnailUrl).toMatch(/^\/thumbs\//);
        expect(a.status).toBe('PUBLISHED');
      }
    }
  });

  it('walking /assets?limit=100 yields every PUBLISHED asset exactly once, newest first', async () => {
    const seen: AssetSummary[] = [];
    let cursor: string | undefined;
    do {
      const page: AssetListPage = await app.call('GET', '/assets', {
        query: { limit: 100, cursor },
      });
      seen.push(...page.items);
      cursor = page.pageInfo.hasMore ? page.pageInfo.nextCursor! : undefined;
    } while (cursor);
    expect(seen).toHaveLength(published.length);
    expect(new Set(seen.map((a) => a.id)).size).toBe(published.length);
    expect(new Set(seen.map((a) => a.id))).toEqual(new Set(published.map((a) => a.id)));
    for (const a of seen) expect(a.thumbnailUrl).toMatch(/^\/thumbs\//);
    const dates = seen.map((a) => a.publishedAt!);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it('every sort order walks the full catalog with no duplicates', async () => {
    for (const sort of [
      'newest',
      'mostDownloaded',
      'recentlyUpdated',
      'alphabetical',
      'mostSaved',
    ]) {
      const ids: string[] = [];
      let cursor: string | undefined;
      do {
        const page: AssetListPage = await app.call('GET', '/assets', {
          query: { sort, limit: 17, cursor },
        });
        ids.push(...page.items.map((i) => i.id));
        cursor = page.pageInfo.hasMore ? page.pageInfo.nextCursor! : undefined;
      } while (cursor);
      expect(ids, sort).toHaveLength(published.length);
      expect(new Set(ids).size, sort).toBe(published.length);
    }
  });

  it('/search/assets?q=unity returns hits and a typo-free prefix works', async () => {
    const r = await app.call<SearchAssetsResponse>('GET', '/search/assets', {
      query: { q: 'unity', limit: 100 },
    });
    expect(r.hits.length).toBeGreaterThan(0);
    expect(r.estimatedTotalHits).toBe(r.hits.length);
    for (const h of r.hits) expect(h.thumbnailUrl).toMatch(/^\/thumbs\//);
    const pre = await app.call<SearchAssetsResponse>('GET', '/search/assets', {
      query: { q: 'unit' },
    });
    expect(pre.hits.length).toBeGreaterThan(0);
  });

  it('the persona boots: /auth/me, library, owned drafts and detail pages', async () => {
    const me = await app.call<MeResponse>('GET', '/auth/me');
    expect(me).toMatchObject({
      id: 'u-persona',
      displayName: 'Aria Wijaya',
      isAdmin: true,
      hasPublishedAssets: true,
    });
    expect(me.unreadNotifications).toBe(10);

    const lib = await app.call<LibraryPage>('GET', '/library', { query: { limit: 100 } });
    const seededLib = await app.db.list<LibraryRecord>('library');
    expect(lib.items.length).toBe(seededLib.filter((l) => !l.hidden).length);
    const all = await app.call<LibraryPage>('GET', '/library', {
      query: { limit: 100, hidden: 'all' },
    });
    expect(all.items.length).toBe(seededLib.length);
    for (const i of lib.items) expect(i.asset.totalSaves).toBeGreaterThanOrEqual(1);

    const mine = await app.call<AssetListPage>('GET', '/assets', {
      query: {
        ownerId: 'u-persona',
        includeUnpublished: 'true',
        limit: 100,
        sort: 'recentlyUpdated',
      },
    });
    expect(mine.items.filter((a) => a.status === 'DRAFT')).toHaveLength(2);
    expect(mine.items.filter((a) => a.status === 'ARCHIVED')).toHaveLength(1);
    expect(mine.items.filter((a) => a.status === 'PUBLISHED')).toHaveLength(15);

    const sample = published[0]!;
    const detail = await app.call<AssetDetail>('GET', `/assets/${sample.slug}`);
    expect(detail.id).toBe(sample.id);
    expect(detail.versions.length).toBeGreaterThan(0);
    expect(detail.thumbnail.url).toMatch(/^\/thumbs\//);
    expect(
      (await app.call<AssetSummary[]>('GET', `/assets/${sample.id}/recommended`)).length,
    ).toBeGreaterThan(0);
    const savedId = lib.items[0]!.asset.id;
    expect((await app.call<AssetDetail>('GET', `/assets/${savedId}`)).isSaved).toBe(true);
  });
});

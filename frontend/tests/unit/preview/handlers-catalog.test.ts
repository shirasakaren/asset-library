import { describe, it, expect, vi } from 'vitest';
import {
  createTestApp,
  fixtureAsset,
  fixtureCatalog,
  FX_OTHER,
  FX_PERSONA,
} from '@/preview/test-utils';
import { bus } from '@/preview/events/bus';
import { ApiError } from '@/lib/api/errors';
import type {
  AssetRecord,
  FeaturedRecord,
  LibraryRecord,
  NotificationRecord,
  UserRecord,
} from '@/preview/records';
import type {
  AssetDetail,
  AssetListPage,
  AssetSummary,
  Category,
  DiscoverResponse,
  LibraryPage,
  LicenseSummary,
  MeResponse,
  SearchAssetsResponse,
  Tag,
} from '@/lib/api/types';

const libRow = (id: string, addedAt: string, hidden = false): LibraryRecord => ({
  id,
  addedAt,
  hidden,
});
const status = (s: number) => (e: unknown) => ApiError.isApiError(e) && e.status === s;

async function walk(
  app: Awaited<ReturnType<typeof createTestApp>>,
  query: Record<string, unknown>,
): Promise<AssetSummary[]> {
  const out: AssetSummary[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 200; i += 1) {
    const page = await app.call<AssetListPage>('GET', '/assets', { query: { ...query, cursor } });
    out.push(...page.items);
    if (!page.pageInfo.hasMore) return out;
    cursor = page.pageInfo.nextCursor!;
  }
  throw new Error('pagination did not terminate');
}

describe('GET /categories', () => {
  it('lists active categories by sortOrder with the PUBLISHED asset count and localized names', async () => {
    const seed = fixtureCatalog(10); // 5 per category
    (seed.assets as AssetRecord[]).push(
      fixtureAsset('a-draft', { status: 'DRAFT', categoryId: 'cat-3d-models' }),
      fixtureAsset('a-arch', { status: 'ARCHIVED', categoryId: 'cat-3d-models' }),
      fixtureAsset('a-del', { status: 'DELETED', categoryId: 'cat-2d-art' }),
    );
    const app = await createTestApp(seed);
    const cats = await app.call<Category[]>('GET', '/categories');
    expect(cats.map((c) => c.id)).toEqual(['cat-3d-models', 'cat-2d-art', 'cat-empty']);
    expect(cats.map((c) => c.assetCount)).toEqual([5, 5, 0]);
    expect(cats[0]).toMatchObject({
      slug: '3d-models',
      name: '3D Models',
      iconKey: 'box',
      sortOrder: 10,
    });
    const id = await app.call<Category[]>('GET', '/categories', { locale: 'id' });
    expect(id[0]!.name).toBe('Model 3D');
    const viaQuery = await app.call<Category[]>('GET', '/categories', { query: { locale: 'id' } });
    expect(viaQuery[1]!.name).toBe('Seni 2D & Sprite');
  });

  it('hides inactive categories', async () => {
    const seed = fixtureCatalog(2);
    (seed.categories as { id: string; isActive: boolean }[])[2]!.isActive = false;
    const app = await createTestApp(seed);
    const cats = await app.call<Category[]>('GET', '/categories');
    expect(cats.map((c) => c.id)).toEqual(['cat-3d-models', 'cat-2d-art']);
  });
});

describe('GET /tags and /search/tags', () => {
  it('returns a plain Tag[] ordered by usageCount desc, filtered by prefix', async () => {
    const app = await createTestApp(fixtureCatalog(1));
    const all = await app.call<Tag[]>('GET', '/tags');
    expect(all.map((t) => t.slug)).toEqual(['pixel', 'lowpoly', 'lava', 'unused']);
    const l = await app.call<Tag[]>('GET', '/tags', { query: { q: 'LA' } });
    expect(l.map((t) => t.slug)).toEqual(['lava']);
    const word = await app.call<Tag[]>('GET', '/tags', { query: { q: 'poly' } });
    expect(word.map((t) => t.slug)).toEqual([]); // prefix only, "poly" is not a prefix of "Low Poly"/"lowpoly"
    const wordStart = await app.call<Tag[]>('GET', '/tags', { query: { q: 'low' } });
    expect(wordStart[0]).toEqual({
      id: 'tag-lowpoly',
      slug: 'lowpoly',
      displayName: 'Low Poly',
      usageCount: 5,
    });
    expect(await app.call<Tag[]>('GET', '/tags', { query: { limit: 2 } })).toHaveLength(2);
  });

  it('search/tags matches prefixes first, then contains, and is empty without q', async () => {
    const app = await createTestApp(fixtureCatalog(1));
    expect(await app.call<Tag[]>('GET', '/search/tags')).toEqual([]);
    expect(await app.call<Tag[]>('GET', '/search/tags', { query: { q: '  ' } })).toEqual([]);
    const r = await app.call<Tag[]>('GET', '/search/tags', { query: { q: 'l' } });
    // prefix matches (Low Poly 5, Lava 2) before contains-only (Pixel 9 contains "l")
    expect(r.map((t) => t.slug)).toEqual(['lowpoly', 'lava', 'pixel']);
    const c = await app.call<Tag[]>('GET', '/search/tags', { query: { q: 'poly', limit: 5 } });
    expect(c.map((t) => t.slug)).toEqual(['lowpoly']);
    await expect(
      app.call('GET', '/search/tags', { query: { q: 'l', limit: 'x' } }),
    ).rejects.toSatisfy(status(400));
  });
});

describe('GET /licenses', () => {
  it('lists localized summaries and resolves detail by id or slug', async () => {
    const app = await createTestApp(fixtureCatalog(1));
    const list = await app.call<LicenseSummary[]>('GET', '/licenses', { query: { locale: 'id' } });
    expect(list).toEqual([
      {
        id: 'lic-mit',
        slug: 'mit',
        name: 'MIT License',
        description: 'Lisensi permisif.',
        sortOrder: 10,
      },
      {
        id: 'lic-cc0',
        slug: 'cc0',
        name: 'CC0 1.0 Universal',
        description: 'Domain publik.',
        sortOrder: 20,
      },
    ]);
    const d = await app.call<{ id: string; name: string; fullText: string }>(
      'GET',
      '/licenses/lic-cc0',
      {
        query: { locale: 'id' },
      },
    );
    expect(d).toMatchObject({
      id: 'lic-cc0',
      name: 'CC0 1.0 Universal',
      fullText: 'Teks lengkap CC0',
    });
    // Indonesian full text is empty for MIT: fall back to English
    const mit = await app.call<{ fullText: string }>('GET', '/licenses/mit', {
      query: { locale: 'id' },
    });
    expect(mit.fullText).toBe('MIT full text');
    await expect(app.call('GET', '/licenses/nope')).rejects.toSatisfy(status(404));
  });
});

describe('GET /discover', () => {
  const featuredSeed = (): FeaturedRecord[] =>
    [3, 1, 2].map((n, idx) => ({
      id: `fs-${n}`,
      assetId: `a-fx-00${n}`,
      customBannerKey: null,
      customBannerUrl: n === 2 ? '/thumbs/custom.webp' : null,
      customTitle: n === 3 ? 'Custom Title' : null,
      customShortDescription: n === 3 ? { en: 'Custom en', id: 'Custom id' } : null,
      sortOrder: n,
      isActive: idx !== 99,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }));

  it('returns non-empty category rows (max 12, newest first) and featured slots in order', async () => {
    const seed = fixtureCatalog(40);
    seed.featured = featuredSeed();
    (seed.featured as FeaturedRecord[]).push({
      ...featuredSeed()[0]!,
      id: 'fs-off',
      isActive: false,
      sortOrder: 0,
    });
    const app = await createTestApp(seed);
    const d = await app.call<DiscoverResponse>('GET', '/discover');
    expect(d.rows.map((r) => r.categoryId)).toEqual(['cat-3d-models', 'cat-2d-art']); // cat-empty dropped
    for (const row of d.rows) {
      expect(row.assets).toHaveLength(12);
      const dates = row.assets.map((a) => a.publishedAt!);
      expect([...dates].sort().reverse()).toEqual(dates);
    }
    expect(d.rows[0]).toMatchObject({ categorySlug: '3d-models', name: '3D Models' });
    // cat-3d-models are odd indices; newest is a-fx-039
    expect(d.rows[0]!.assets[0]!.id).toBe('a-fx-039');
    expect(d.featured.map((f) => f.id)).toEqual(['fs-1', 'fs-2', 'fs-3']);
    expect(d.featured[2]).toMatchObject({
      assetId: 'a-fx-003',
      assetSlug: 'fx-003',
      title: 'Custom Title',
      shortDescription: 'Custom en',
      bannerUrl: '/thumbs/fx-003.webp',
      sortOrder: 3,
    });
    expect(d.featured[1]!.bannerUrl).toBe('/thumbs/custom.webp');
    expect(d.featured[0]!.title).toBe('Fixture Item 001');
    const id = await app.call<DiscoverResponse>('GET', '/discover', { query: { locale: 'id' } });
    expect(id.featured[2]!.shortDescription).toBe('Custom id');
    expect(id.featured[0]!.shortDescription).toBe('Teks singkat untuk fx-001.');
    expect(id.rows[1]!.name).toBe('Seni 2D & Sprite');
  });

  it('skips featured slots whose asset is not published and keeps at most 5', async () => {
    const seed = fixtureCatalog(8);
    (seed.assets as AssetRecord[]).push(fixtureAsset('a-draft', { status: 'DRAFT' }));
    seed.featured = Array.from({ length: 7 }, (_, i) => ({
      ...featuredSeed()[0]!,
      id: `fs-x${i}`,
      assetId: i === 0 ? 'a-draft' : `a-fx-00${i}`,
      sortOrder: i,
      customTitle: null,
      customShortDescription: null,
    }));
    const app = await createTestApp(seed);
    const d = await app.call<DiscoverResponse>('GET', '/discover');
    expect(d.featured.map((f) => f.id)).toEqual(['fs-x1', 'fs-x2', 'fs-x3', 'fs-x4', 'fs-x5']);
  });
});

describe('GET /assets', () => {
  it('filters by category and paginates without duplicates', async () => {
    const app = await createTestApp(fixtureCatalog(40));
    const p1 = await app.call<AssetListPage>('GET', '/assets', {
      query: { categoryIds: ['cat-3d-models'], limit: 10 },
    });
    expect(p1.items).toHaveLength(10);
    expect(p1.pageInfo.hasMore).toBe(true);
    const p2 = await app.call<AssetListPage>('GET', '/assets', {
      query: { categoryIds: ['cat-3d-models'], limit: 10, cursor: p1.pageInfo.nextCursor! },
    });
    expect(new Set([...p1.items, ...p2.items].map((i) => i.id)).size).toBe(20);
    const all = await walk(app, { categoryIds: ['cat-3d-models'], limit: 7 });
    expect(all).toHaveLength(20);
    expect(new Set(all.map((a) => a.id)).size).toBe(20);
    expect(all.every((a) => a.categoryName === '3D Models')).toBe(true);
  });

  it('accepts repeated and comma-separated array params', async () => {
    const app = await createTestApp(fixtureCatalog(10));
    const rep = await app.call<AssetListPage>('GET', '/assets', {
      query: { categoryIds: ['cat-3d-models', 'cat-2d-art'], limit: 100 },
    });
    const comma = await app.call<AssetListPage>('GET', '/assets', {
      query: { categoryIds: 'cat-3d-models,cat-2d-art', limit: 100 },
    });
    expect(rep.items).toHaveLength(10);
    expect(comma.items.map((i) => i.id)).toEqual(rep.items.map((i) => i.id));
  });

  it('returns summaries with the documented derived fields', async () => {
    const app = await createTestApp(fixtureCatalog(2));
    const { items } = await app.call<AssetListPage>('GET', '/assets', {
      query: { sort: 'alphabetical' },
    });
    expect(items[0]).toEqual({
      id: 'a-fx-001',
      slug: 'fx-001',
      title: 'Fixture Item 001',
      shortDescription: 'Short text for fx-001.',
      engine: 'UNITY',
      status: 'PUBLISHED',
      thumbnailUrl: '/thumbs/fx-001.webp',
      ownerDisplayName: 'Kenji Matsuda',
      categoryName: '3D Models',
      totalDownloads: 2,
      totalSaves: 1,
      updatedAt: '2026-01-02T00:00:00.000Z',
      publishedAt: '2026-01-02T00:00:00.000Z',
    });
  });

  it('filters by engine, tag slug, license id/slug, file kind, render pipeline and target', async () => {
    const seed = fixtureCatalog(9);
    const assets = seed.assets as AssetRecord[];
    assets[0]!.engine = 'UNREAL';
    assets[1]!.versions[0]!.compatibility = [
      { engineVersion: '1', renderPipelines: ['HDRP'], targets: ['VR'] },
    ];
    assets[2]!.versions[0]!.files[0]!.kind = 'GLB';
    const app = await createTestApp(seed);
    const ids = async (query: Record<string, unknown>) =>
      (
        await app.call<AssetListPage>('GET', '/assets', {
          query: { ...query, limit: 100, sort: 'alphabetical' },
        })
      ).items.map((i) => i.id);
    expect(await ids({ engine: 'UNREAL' })).toEqual(['a-fx-001']);
    expect(await ids({ tags: 'lowpoly' })).toEqual(['a-fx-003', 'a-fx-006', 'a-fx-009']);
    expect(await ids({ tags: ['tag-lowpoly', 'nope'] })).toEqual([
      'a-fx-003',
      'a-fx-006',
      'a-fx-009',
    ]);
    expect((await ids({ licenseIds: ['lic-cc0'] })).length).toBe(4);
    expect(await ids({ licenseSlug: 'cc0' })).toEqual(await ids({ licenseIds: 'lic-cc0' }));
    expect(await ids({ fileKinds: ['GLB'] })).toEqual(['a-fx-003']);
    expect(await ids({ renderPipelines: ['HDRP'] })).toEqual(['a-fx-002']);
    expect(await ids({ targets: ['VR'] })).toEqual(['a-fx-002']);
    expect(await ids({ ownerId: 'u-third' })).toEqual([]);
    await expect(app.call('GET', '/assets', { query: { engine: 'BOGUS' } })).rejects.toSatisfy(
      status(400),
    );
  });

  it('every sort order is total, even with ties, and stable across paginated walks', async () => {
    const app = await createTestApp(fixtureCatalog(30)); // downloads in 0..4, saves in 0..3: lots of ties
    const expectOrder = {
      newest: (a: AssetSummary, b: AssetSummary) => (a.publishedAt! < b.publishedAt! ? 1 : -1),
      mostDownloaded: (a: AssetSummary, b: AssetSummary) => b.totalDownloads - a.totalDownloads,
      mostSaved: (a: AssetSummary, b: AssetSummary) => b.totalSaves - a.totalSaves,
      recentlyUpdated: (a: AssetSummary, b: AssetSummary) => (a.updatedAt < b.updatedAt ? 1 : -1),
      alphabetical: (a: AssetSummary, b: AssetSummary) => (a.title < b.title ? -1 : 1),
    } as const;
    for (const sort of Object.keys(expectOrder) as (keyof typeof expectOrder)[]) {
      const full = await app.call<AssetListPage>('GET', '/assets', { query: { sort, limit: 100 } });
      const walked = await walk(app, { sort, limit: 4 });
      expect(
        walked.map((a) => a.id),
        sort,
      ).toEqual(full.items.map((a) => a.id));
      expect(new Set(walked.map((a) => a.id)).size, sort).toBe(30);
      for (let i = 1; i < full.items.length; i += 1) {
        const prev = full.items[i - 1]!;
        const cur = full.items[i]!;
        expect(expectOrder[sort](prev, cur) <= 0, `${sort} @${i}`).toBe(true);
      }
      const again = await app.call<AssetListPage>('GET', '/assets', {
        query: { sort, limit: 100 },
      });
      expect(again.items.map((a) => a.id)).toEqual(full.items.map((a) => a.id));
    }
  });

  it('defaults to newest and rejects an unknown sort with 400', async () => {
    const app = await createTestApp(fixtureCatalog(5));
    const def = await app.call<AssetListPage>('GET', '/assets');
    expect(def.items.map((i) => i.id)).toEqual([
      'a-fx-005',
      'a-fx-004',
      'a-fx-003',
      'a-fx-002',
      'a-fx-001',
    ]);
    await expect(app.call('GET', '/assets', { query: { sort: 'popular' } })).rejects.toSatisfy(
      status(400),
    );
  });

  it('serves Indonesian titles and short descriptions when the locale is id', async () => {
    const seed = fixtureCatalog(1);
    (seed.assets as AssetRecord[])[0]!.titleI18n = {
      en: 'Fixture Item 001',
      id: 'Barang Fixture 001',
    };
    const app = await createTestApp(seed);
    const en = await app.call<AssetListPage>('GET', '/assets');
    const id = await app.call<AssetListPage>('GET', '/assets', { query: { locale: 'id' } });
    expect(en.items[0]).toMatchObject({ title: 'Fixture Item 001', categoryName: '3D Models' });
    expect(id.items[0]).toMatchObject({
      title: 'Barang Fixture 001',
      shortDescription: 'Teks singkat untuk fx-001.',
      categoryName: 'Model 3D',
    });
    const viaHeader = await app.call<AssetListPage>('GET', '/assets', { locale: 'id' });
    expect(viaHeader.items[0]!.title).toBe('Barang Fixture 001');
  });

  it('only lists PUBLISHED assets publicly; drafts of others are invisible, own are visible by status', async () => {
    const seed = fixtureCatalog(3);
    (seed.assets as AssetRecord[]).push(
      fixtureAsset('a-my-draft', { status: 'DRAFT', ownerId: FX_OTHER }),
      fixtureAsset('a-my-arch', { status: 'ARCHIVED', ownerId: FX_OTHER }),
      fixtureAsset('a-their-draft', { status: 'DRAFT', ownerId: 'u-third' }),
      fixtureAsset('a-deleted', { status: 'DELETED', ownerId: FX_OTHER }),
    );
    const app = await createTestApp(seed, { meId: FX_OTHER }); // non-admin contributor
    const pub = await app.call<AssetListPage>('GET', '/assets', { query: { limit: 100 } });
    expect(pub.items.map((i) => i.status)).toEqual(['PUBLISHED', 'PUBLISHED', 'PUBLISHED']);

    const drafts = await app.call<AssetListPage>('GET', '/assets', {
      query: { ownerId: FX_OTHER, status: 'DRAFT' },
    });
    expect(drafts.items.map((i) => i.id)).toEqual(['a-my-draft']);

    const mine = await app.call<AssetListPage>('GET', '/assets', {
      query: { ownerId: FX_OTHER, includeUnpublished: 'true', limit: 100 },
    });
    expect(mine.items.map((i) => i.id).sort()).toEqual(
      ['a-fx-001', 'a-fx-002', 'a-fx-003', 'a-my-arch', 'a-my-draft'].sort(),
    );

    // someone else's drafts: not via ownerId, not via status, not via includeUnpublished
    for (const query of [
      { ownerId: 'u-third', status: 'DRAFT' },
      { status: 'DRAFT' },
      { includeUnpublished: 'true' },
    ]) {
      const r = await app.call<AssetListPage>('GET', '/assets', {
        query: { ...query, limit: 100 },
      });
      expect(
        r.items.some((i) => i.id === 'a-their-draft'),
        JSON.stringify(query),
      ).toBe(false);
      expect(r.items.every((i) => i.status === 'PUBLISHED')).toBe(true);
    }
    expect(
      (await app.call<AssetListPage>('GET', '/assets', { query: { status: 'DRAFT' } })).items,
    ).toEqual([]);
  });

  it('lets an admin see any non-deleted status', async () => {
    const seed = fixtureCatalog(2);
    (seed.assets as AssetRecord[]).push(
      fixtureAsset('a-their-draft', { status: 'DRAFT', ownerId: 'u-third' }),
      fixtureAsset('a-deleted', { status: 'DELETED', ownerId: FX_OTHER }),
    );
    const app = await createTestApp(seed); // persona is admin
    const drafts = await app.call<AssetListPage>('GET', '/assets', { query: { status: 'DRAFT' } });
    expect(drafts.items.map((i) => i.id)).toEqual(['a-their-draft']);
    expect(drafts.items[0]!.publishedAt).toBeNull();
    const all = await app.call<AssetListPage>('GET', '/assets', {
      query: { includeUnpublished: 'true', limit: 100 },
    });
    expect(all.items.map((i) => i.id)).not.toContain('a-deleted');
    expect(all.items).toHaveLength(3);
    await expect(app.call('GET', '/assets', { query: { status: 'WAT' } })).rejects.toSatisfy(
      status(400),
    );
  });

  it('q filters and ranks (relevance when no sort is given)', async () => {
    const seed = fixtureCatalog(0);
    (seed.assets as AssetRecord[]).push(
      fixtureAsset('a-1', { title: 'Sword Pack', shortDescription: 'melee gear' }),
      fixtureAsset('a-2', {
        title: 'Armor Set',
        shortDescription: 'matches a sword too',
        publishedAt: '2026-05-01T00:00:00.000Z',
      }),
      fixtureAsset('a-3', { title: 'Trees', shortDescription: 'nothing' }),
    );
    const app = await createTestApp(seed);
    const r = await app.call<AssetListPage>('GET', '/assets', { query: { q: 'sword' } });
    expect(r.items.map((i) => i.id)).toEqual(['a-1', 'a-2']);
    const sorted = await app.call<AssetListPage>('GET', '/assets', {
      query: { q: 'sword', sort: 'newest' },
    });
    expect(sorted.items.map((i) => i.id)).toEqual(['a-2', 'a-1']);
  });
});

describe('GET /assets/{idOrSlug}', () => {
  it('resolves by id or slug with owner, category, license and tags', async () => {
    const seed = fixtureCatalog(3);
    const app = await createTestApp(seed);
    const bySlug = await app.call<AssetDetail>('GET', '/assets/fx-003');
    const byId = await app.call<AssetDetail>('GET', '/assets/a-fx-003');
    expect(byId).toEqual(bySlug);
    expect(bySlug).toMatchObject({
      id: 'a-fx-003',
      slug: 'fx-003',
      title: 'Fixture Item 003',
      engine: 'UNITY',
      category: { id: 'cat-3d-models', slug: '3d-models', name: '3D Models' },
      license: { id: 'lic-mit', slug: 'mit', name: 'MIT License' },
      tags: [{ id: 'tag-lowpoly', slug: 'lowpoly', displayName: 'Low Poly' }],
      owner: {
        id: FX_OTHER,
        displayName: 'Kenji Matsuda',
        avatar: { initials: 'KM', bgColor: 'brand-green', fgColor: 'ink-white' },
      },
      thumbnail: { key: 'thumbs/fx-003.webp', url: '/thumbs/fx-003.webp' },
      thumbnailAutoGenerated: null,
      availableLocales: ['en', 'id'],
      isSaved: false,
      canEdit: true, // persona is admin
      canDelete: true,
      canArchive: true,
    });
    expect(bySlug).not.toHaveProperty('ownerId');
    expect(bySlug).not.toHaveProperty('titleI18n');
    // storeName/storeUrl are public on purpose now (the "View on <store>" link)
    expect(bySlug).toMatchObject({
      storeName: 'Test Store',
      storeUrl: 'https://store.example.test/x',
    });
  });

  it('is a 404 ApiError for unknown, deleted and invisible assets', async () => {
    const seed = fixtureCatalog(1);
    (seed.assets as AssetRecord[]).push(
      fixtureAsset('a-their-draft', { status: 'DRAFT', ownerId: 'u-third' }),
      fixtureAsset('a-my-draft', { status: 'DRAFT', ownerId: FX_OTHER }),
      fixtureAsset('a-deleted', { status: 'DELETED', ownerId: FX_OTHER }),
    );
    const other = await createTestApp(seed, { meId: FX_OTHER });
    await expect(other.call('GET', '/assets/no-such-thing')).rejects.toSatisfy(status(404));
    await expect(other.call('GET', '/assets/their-draft')).rejects.toSatisfy(status(404));
    await expect(other.call('GET', '/assets/a-deleted')).rejects.toSatisfy(status(404));
    const own = await other.call<AssetDetail>('GET', '/assets/a-my-draft', {
      query: { includeUnpublished: 'true' },
    });
    expect(own).toMatchObject({
      status: 'DRAFT',
      canEdit: true,
      canDelete: true,
      canArchive: false,
    });
    // the owner sees the draft even without the flag
    expect((await other.call<AssetDetail>('GET', '/assets/my-draft')).id).toBe('a-my-draft');
    // published asset of someone else: visible, not editable
    const pub = await other.call<AssetDetail>('GET', '/assets/a-fx-001');
    expect(pub.canEdit).toBe(true); // owned by u-other
    const third = await createTestApp(seed, { meId: 'u-third' });
    expect(await third.call<AssetDetail>('GET', '/assets/a-fx-001')).toMatchObject({
      canEdit: false,
      canDelete: false,
      canArchive: false,
    });
    const admin = await createTestApp(seed);
    expect((await admin.call<AssetDetail>('GET', '/assets/a-their-draft')).status).toBe('DRAFT');
    await expect(admin.call('GET', '/assets/a-deleted')).rejects.toSatisfy(status(404));
    expect(ApiError.isApiError(await admin.call('GET', '/assets/zzz').catch((e) => e))).toBe(true);
  });

  it('localizes title and short description and lists versions newest first without internals', async () => {
    const seed = fixtureCatalog(1);
    const a = (seed.assets as AssetRecord[])[0]!;
    a.titleI18n = { en: 'Fixture Item 001', id: 'Barang 001' };
    const v1 = a.versions[0]!;
    a.versions = [
      { ...v1, isLatest: false, semver: '1.2.0', id: 'v-a', createdAt: '2026-01-02T00:00:00.000Z' },
      { ...v1, isLatest: true, semver: '1.10.0', id: 'v-b', createdAt: '2026-01-01T00:00:00.000Z' },
      { ...v1, isLatest: false, semver: '0.9.0', id: 'v-c', createdAt: '2026-01-03T00:00:00.000Z' },
    ];
    const app = await createTestApp(seed);
    const d = await app.call<AssetDetail>('GET', '/assets/fx-001', { query: { locale: 'id' } });
    expect(d.title).toBe('Barang 001');
    expect(d.shortDescription).toBe('Teks singkat untuk fx-001.');
    expect(d.category.name).toBe('Model 3D');
    expect(d.versions.map((v) => v.semver)).toEqual(['1.10.0', '1.2.0', '0.9.0']);
    expect(d.versions[0]).not.toHaveProperty('avStatus');
    expect(d.versions[0]).not.toHaveProperty('createdAt');
    expect(d.versions[0]!.files[0]!.id).toBeTruthy();
  });

  it('does not repeat the cover thumbnail in previewMedia', async () => {
    const seed = fixtureCatalog(1);
    const media = (id: string, url: string, key: string) => ({
      id,
      kind: 'image' as const,
      key,
      label: id,
      viewUrl: url,
    });
    (seed.assets as AssetRecord[])[0]!.previewMedia = [
      media('pm-1', '/thumbs/fx-001.webp', 'thumbs/fx-001.webp'),
      media('pm-2', '/other.webp', 'other.webp'),
    ];
    const app = await createTestApp(seed);
    const d = await app.call<AssetDetail>('GET', '/assets/fx-001');
    expect(d.previewMedia.map((m) => m.id)).toEqual(['pm-2']);
  });

  it('keeps thumbnail.url and falls back to the auto thumbnail for the summary', async () => {
    const seed = fixtureCatalog(1);
    (seed.assets as AssetRecord[])[0]!.thumbnail = { key: null, url: null };
    (seed.assets as AssetRecord[])[0]!.thumbnailAutoGenerated = {
      key: 'k',
      url: '/thumbs/auto.webp',
    };
    const app = await createTestApp(seed);
    const d = await app.call<AssetListPage>('GET', '/assets');
    expect(d.items[0]!.thumbnailUrl).toBe('/thumbs/auto.webp');
    const none = fixtureCatalog(1);
    (none.assets as AssetRecord[])[0]!.thumbnail = { key: null, url: null };
    const app2 = await createTestApp(none);
    expect((await app2.call<AssetListPage>('GET', '/assets')).items[0]!.thumbnailUrl).toBeNull();
  });
});

describe('GET /assets/{id}/recommended', () => {
  it('returns up to 8 published assets sharing the category or tags, excluding itself', async () => {
    const seed = fixtureCatalog(30);
    const assets = seed.assets as AssetRecord[];
    assets.push(
      fixtureAsset('a-draft', { status: 'DRAFT', categoryId: 'cat-3d-models' }),
      fixtureAsset('a-tagged', {
        categoryId: 'cat-2d-art',
        tagIds: ['tag-lowpoly'],
        totalDownloads: 99,
      }),
    );
    const app = await createTestApp(seed);
    const r = await app.call<AssetSummary[]>('GET', '/assets/a-fx-001/recommended');
    expect(r.length).toBe(8);
    expect(r.map((x) => x.id)).not.toContain('a-fx-001');
    expect(r.map((x) => x.id)).not.toContain('a-draft');
    // a-fx-003 is in the same category and shares no tag with fx-001, but a-fx-003 has lowpoly
    const r3 = await app.call<AssetSummary[]>('GET', '/assets/fx-003/recommended');
    expect(r3.map((x) => x.id)).toContain('a-tagged'); // shares the tag, so it ranks high
    expect(r3).toHaveLength(8);
    await expect(app.call('GET', '/assets/nope/recommended')).rejects.toSatisfy(status(404));
    await expect(app.call('GET', '/assets/a-draft/recommended')).resolves.toBeInstanceOf(Array); // admin may see it
  });

  it('404s for assets the viewer cannot see', async () => {
    const seed = fixtureCatalog(3);
    (seed.assets as AssetRecord[]).push(
      fixtureAsset('a-draft', { status: 'DRAFT', ownerId: 'u-third' }),
    );
    const app = await createTestApp(seed, { meId: FX_OTHER });
    await expect(app.call('GET', '/assets/a-draft/recommended')).rejects.toSatisfy(status(404));
  });
});

describe('GET /search/assets', () => {
  const searchSeed = () => {
    const seed = fixtureCatalog(0);
    (seed.assets as AssetRecord[]).push(
      fixtureAsset('a-desc', {
        title: 'Forest Kit',
        shortDescription: 'Includes a lava shader',
        totalDownloads: 500,
        publishedAt: '2026-04-01T00:00:00.000Z',
      }),
      fixtureAsset('a-title', {
        title: 'Lava Flow',
        shortDescription: 'Molten rock',
        totalDownloads: 1,
        publishedAt: '2026-03-01T00:00:00.000Z',
      }),
      fixtureAsset('a-tag', {
        title: 'Rocks',
        shortDescription: 'Boulders',
        tagIds: ['tag-lava'],
        totalDownloads: 1000,
        categoryId: 'cat-2d-art',
      }),
      fixtureAsset('a-cafe', { title: 'Café Props', shortDescription: 'Coffee tables' }),
      fixtureAsset('a-draft', { title: 'Lava Draft', status: 'DRAFT' }),
      fixtureAsset('a-owner', { title: 'Unrelated', ownerId: 'u-third' }),
    );
    return seed;
  };

  it('ranks title matches above tag above description, ties by downloads then id', async () => {
    const app = await createTestApp(searchSeed());
    const r = await app.call<SearchAssetsResponse>('GET', '/search/assets', {
      query: { q: 'lava' },
    });
    expect(r.hits.map((h) => h.id)).toEqual(['a-title', 'a-tag', 'a-desc']);
    expect(r.estimatedTotalHits).toBe(3);
    expect(r.processingTimeMs).toBeGreaterThanOrEqual(1);
    expect(r.processingTimeMs).toBeLessThanOrEqual(3);
    expect(r.hits[0]).toEqual({
      id: 'a-title',
      slug: 'title',
      title: 'Lava Flow',
      shortDescription: 'Molten rock',
      thumbnailUrl: '/thumbs/title.webp',
      engine: 'UNITY',
      categoryName: '3D Models',
      ownerName: 'Kenji Matsuda',
      totalDownloads: 1,
    });
  });

  it('matches case/diacritic-insensitively, ANDs tokens and prefix-matches the last one', async () => {
    const app = await createTestApp(searchSeed());
    const hits = async (q: string, extra: Record<string, unknown> = {}) =>
      (
        await app.call<SearchAssetsResponse>('GET', '/search/assets', { query: { q, ...extra } })
      ).hits.map((h) => h.id);
    expect(await hits('CAFE')).toEqual(['a-cafe']);
    expect(await hits('café')).toEqual(['a-cafe']);
    expect(await hits('caf')).toEqual(['a-cafe']); // prefix on the last token
    expect(await hits('lav')).toEqual(['a-title', 'a-tag', 'a-desc']);
    expect(await hits('lava flo')).toEqual(['a-title']); // AND, last token prefix
    expect(await hits('lava zzz')).toEqual([]);
    expect(await hits('la flow')).toEqual([]); // only the LAST token is a prefix
    expect(await hits('owner kenji')).toEqual([]); // "kenji" must hit a field of the same asset
    expect(await hits('kenji')).not.toContain('a-owner');
    expect(await hits('unrelated')).toEqual(['a-owner']);
    expect(await hits('3d models lava')).toContain('a-title'); // category name token
    expect(await hits('lava-flow')).toEqual(['a-title']);
  });

  it('falls back to substring matching for CJK text', async () => {
    const seed = fixtureCatalog(0);
    (seed.assets as AssetRecord[]).push(
      fixtureAsset('a-jp', { title: 'Tool', shortDescription: '桜の木のモデル' }),
      fixtureAsset('a-en', { title: 'Tree' }),
    );
    const app = await createTestApp(seed);
    const r = await app.call<SearchAssetsResponse>('GET', '/search/assets', {
      query: { q: '桜の木' },
    });
    expect(r.hits.map((h) => h.id)).toEqual(['a-jp']);
  });

  it('applies the /assets filters, limit and offset, and excludes unpublished assets', async () => {
    const app = await createTestApp(searchSeed());
    const filtered = await app.call<SearchAssetsResponse>('GET', '/search/assets', {
      query: { q: 'lava', categoryIds: ['cat-2d-art'] },
    });
    expect(filtered.hits.map((h) => h.id)).toEqual(['a-tag']);
    const p1 = await app.call<SearchAssetsResponse>('GET', '/search/assets', {
      query: { q: 'lava', limit: 2 },
    });
    const p2 = await app.call<SearchAssetsResponse>('GET', '/search/assets', {
      query: { q: 'lava', limit: 2, offset: 2 },
    });
    expect(p1.hits).toHaveLength(2);
    expect(p1.estimatedTotalHits).toBe(3);
    expect(p2.hits.map((h) => h.id)).toEqual(['a-desc']);
    expect(
      (await app.call<SearchAssetsResponse>('GET', '/search/assets', { query: { q: 'draft' } }))
        .hits,
    ).toEqual([]);
    await expect(
      app.call('GET', '/search/assets', { query: { q: 'lava', offset: -1 } }),
    ).rejects.toSatisfy(status(400));
    await expect(
      app.call('GET', '/search/assets', { query: { q: 'lava', engine: 'NOPE' } }),
    ).rejects.toSatisfy(status(400));
  });

  it('returns browse order for an empty q', async () => {
    const app = await createTestApp(searchSeed());
    const r = await app.call<SearchAssetsResponse>('GET', '/search/assets', {
      query: { limit: 3 },
    });
    expect(r.hits).toHaveLength(3);
    expect(r.hits[0]!.id).toBe('a-desc'); // newest published first
    expect(r.estimatedTotalHits).toBe(5);
    const blank = await app.call<SearchAssetsResponse>('GET', '/search/assets', {
      query: { q: '   ' },
    });
    expect(blank.hits.map((h) => h.id)).toEqual(
      (
        await app.call<SearchAssetsResponse>('GET', '/search/assets', { query: { limit: 24 } })
      ).hits.map((h) => h.id),
    );
  });

  it('localizes category and short description', async () => {
    const app = await createTestApp(searchSeed());
    const r = await app.call<SearchAssetsResponse>('GET', '/search/assets', {
      query: { q: 'lava flow', locale: 'id' },
    });
    expect(r.hits[0]).toMatchObject({
      categoryName: 'Model 3D',
      shortDescription: 'Teks singkat untuk title.',
    });
  });
});

describe('library', () => {
  const librarySeed = () => {
    const seed = fixtureCatalog(6);
    (seed.assets as AssetRecord[]).push(fixtureAsset('a-draft', { status: 'DRAFT' }));
    (seed.assets as AssetRecord[])[1]!.totalSaves = 3; // a-fx-002 already has 3 saves by others
    return seed;
  };

  it('save then GET /library shows the item and detail.isSaved is true', async () => {
    const app = await createTestApp(librarySeed());
    const emitted = vi.fn();
    const off = bus.on(emitted);
    expect(
      await app.call('POST', '/library/items', { body: { assetId: 'a-fx-002' } }),
    ).toBeUndefined();
    off();
    expect(emitted).toHaveBeenCalledWith({ type: 'assets.changed' });
    const lib = await app.call<LibraryPage>('GET', '/library');
    expect(lib.items).toHaveLength(1);
    expect(lib.items[0]).toMatchObject({ hidden: false, asset: { id: 'a-fx-002', totalSaves: 4 } });
    expect(typeof lib.items[0]!.addedAt).toBe('string');
    const detail = await app.call<AssetDetail>('GET', '/assets/fx-002');
    expect(detail.isSaved).toBe(true);
    expect(detail.totalSaves).toBe(4);
    expect(
      (await app.call<AssetListPage>('GET', '/assets', { query: { limit: 100 } })).items.find(
        (a) => a.id === 'a-fx-002',
      )!.totalSaves,
    ).toBe(4);
    expect((await app.call<AssetDetail>('GET', '/assets/fx-001')).isSaved).toBe(false);
  });

  it('saving twice keeps one record, the original addedAt and a single +1', async () => {
    const app = await createTestApp(librarySeed());
    await app.call('POST', '/library/items', { body: { assetId: 'a-fx-002' } });
    const first = await app.db.get<LibraryRecord>('library', 'a-fx-002');
    await new Promise((r) => setTimeout(r, 5));
    await app.call('POST', '/library/items', { body: { assetId: 'a-fx-002' } });
    const second = await app.db.get<LibraryRecord>('library', 'a-fx-002');
    expect(second!.addedAt).toBe(first!.addedAt);
    expect(await app.db.list('library')).toHaveLength(1);
    expect((await app.call<AssetDetail>('GET', '/assets/fx-002')).totalSaves).toBe(4);
  });

  it('unsave removes the item, decrements once and is idempotent', async () => {
    const app = await createTestApp(librarySeed());
    await app.call('POST', '/library/items', { body: { assetId: 'a-fx-002' } });
    expect(await app.call('DELETE', '/library/items/a-fx-002')).toBeUndefined();
    expect(await app.call('DELETE', '/library/items/a-fx-002')).toBeUndefined();
    expect(await app.call('DELETE', '/library/items/a-never-saved')).toBeUndefined();
    expect((await app.call<LibraryPage>('GET', '/library')).items).toEqual([]);
    const d = await app.call<AssetDetail>('GET', '/assets/fx-002');
    expect(d.isSaved).toBe(false);
    expect(d.totalSaves).toBe(3);
  });

  it('never lets totalSaves go below zero', async () => {
    const seed = librarySeed();
    seed.library = [libRow('a-fx-001', '2026-02-01T00:00:00.000Z')];
    const app = await createTestApp(seed); // fx-001 has totalSaves 1 (includes the persona)
    await app.call('DELETE', '/library/items/a-fx-001');
    expect((await app.call<AssetDetail>('GET', '/assets/fx-001')).totalSaves).toBe(0);
  });

  it('rejects saving unknown, unpublished or deleted assets and malformed bodies', async () => {
    const seed = librarySeed();
    (seed.assets as AssetRecord[]).push(fixtureAsset('a-deleted', { status: 'DELETED' }));
    const app = await createTestApp(seed);
    for (const assetId of ['a-nope', 'a-draft', 'a-deleted']) {
      await expect(
        app.call('POST', '/library/items', { body: { assetId } }),
        assetId,
      ).rejects.toSatisfy(status(404));
    }
    await expect(app.call('POST', '/library/items', { body: {} })).rejects.toSatisfy(status(400));
    await expect(app.call('POST', '/library/items', { body: { assetId: 42 } })).rejects.toSatisfy(
      status(400),
    );
    await expect(app.call('POST', '/library/items')).rejects.toSatisfy(status(400));
    expect(await app.db.list('library')).toEqual([]);
  });

  it('PATCH toggles hidden; hidden items leave the default listing', async () => {
    const app = await createTestApp(librarySeed());
    await app.call('POST', '/library/items', { body: { assetId: 'a-fx-001' } });
    await app.call('POST', '/library/items', { body: { assetId: 'a-fx-002' } });
    expect(
      await app.call('PATCH', '/library/items/a-fx-002', { body: { hidden: true } }),
    ).toBeUndefined();
    const ids = async (hidden?: string) =>
      (
        await app.call<LibraryPage>('GET', '/library', { query: hidden ? { hidden } : {} })
      ).items.map((i) => i.asset.id);
    expect(await ids()).toEqual(['a-fx-001']);
    expect(await ids('false')).toEqual(['a-fx-001']);
    expect(await ids('true')).toEqual(['a-fx-002']);
    expect((await ids('all')).sort()).toEqual(['a-fx-001', 'a-fx-002']);
    await app.call('PATCH', '/library/items/a-fx-002', { body: { hidden: false } });
    expect((await ids()).sort()).toEqual(['a-fx-001', 'a-fx-002']);
    await expect(
      app.call('PATCH', '/library/items/a-fx-003', { body: { hidden: true } }),
    ).rejects.toSatisfy(status(404));
    await expect(
      app.call('PATCH', '/library/items/a-fx-001', { body: { hidden: 'yes' } }),
    ).rejects.toSatisfy(status(400));
    await expect(app.call('GET', '/library', { query: { hidden: 'maybe' } })).rejects.toSatisfy(
      status(400),
    );
  });

  it('supports sort, q and filters, and paginates with a total order', async () => {
    const seed = fixtureCatalog(10);
    (seed.assets as AssetRecord[]).push(fixtureAsset('a-gone', { status: 'ARCHIVED' }));
    seed.library = [
      libRow('a-fx-001', '2026-03-01T00:00:00.000Z'),
      libRow('a-fx-002', '2026-03-05T00:00:00.000Z'),
      libRow('a-fx-003', '2026-03-05T00:00:00.000Z'), // tie with fx-002
      libRow('a-fx-004', '2026-02-01T00:00:00.000Z'),
      libRow('a-gone', '2026-04-01T00:00:00.000Z'),
    ];
    const app = await createTestApp(seed);
    const ids = async (query: Record<string, unknown> = {}) =>
      (await app.call<LibraryPage>('GET', '/library', { query })).items.map((i) => i.asset.id);
    expect(await ids()).toEqual(['a-fx-002', 'a-fx-003', 'a-fx-001', 'a-fx-004']); // savedAt desc, archived hidden
    expect(await ids({ sort: 'savedAt' })).toEqual(await ids());
    expect(await ids({ sort: 'alphabetical' })).toEqual([
      'a-fx-001',
      'a-fx-002',
      'a-fx-003',
      'a-fx-004',
    ]);
    expect(await ids({ sort: 'recentlyUpdated' })).toEqual([
      'a-fx-004',
      'a-fx-003',
      'a-fx-002',
      'a-fx-001',
    ]);
    expect(await ids({ q: 'item 003' })).toEqual(['a-fx-003']);
    expect(await ids({ q: 'poly' })).toEqual(['a-fx-003']); // tag "Low Poly"
    expect(await ids({ categoryIds: 'cat-2d-art' })).toEqual(['a-fx-002', 'a-fx-004']);
    expect(await ids({ tags: 'lowpoly' })).toEqual(['a-fx-003']);
    expect(await ids({ engine: 'UNREAL' })).toEqual([]);
    await expect(app.call('GET', '/library', { query: { sort: 'newest' } })).rejects.toSatisfy(
      status(400),
    );
    const p1 = await app.call<LibraryPage>('GET', '/library', { query: { limit: 3 } });
    const p2 = await app.call<LibraryPage>('GET', '/library', {
      query: { limit: 3, cursor: p1.pageInfo.nextCursor! },
    });
    expect([...p1.items, ...p2.items].map((i) => i.asset.id)).toEqual(await ids());
    expect(p2.pageInfo).toEqual({ nextCursor: null, hasMore: false });
    expect(p1.items[0]).not.toHaveProperty('id');
  });

  it('localizes library assets', async () => {
    const seed = fixtureCatalog(2);
    seed.library = [libRow('a-fx-001', '2026-03-01T00:00:00.000Z')];
    const app = await createTestApp(seed);
    const lib = await app.call<LibraryPage>('GET', '/library', { query: { locale: 'id' } });
    expect(lib.items[0]!.asset.categoryName).toBe('Model 3D');
  });
});

describe('/auth/me', () => {
  const meSeed = () => {
    const seed = fixtureCatalog(2);
    (seed.assets as AssetRecord[]).push(
      fixtureAsset('a-mine', { ownerId: FX_PERSONA }),
      fixtureAsset('a-mine-draft', { ownerId: FX_OTHER, status: 'DRAFT' }),
    );
    const notifications: NotificationRecord[] = [
      {
        id: 'n-1',
        type: 'COMMENT_CREATED',
        payload: {},
        readAt: null,
        createdAt: '2026-09-30T00:00:00.000Z',
      },
      {
        id: 'n-2',
        type: 'COMMENT_CREATED',
        payload: {},
        readAt: '2026-09-30T01:00:00.000Z',
        createdAt: '2026-09-29T00:00:00.000Z',
      },
      {
        id: 'n-3',
        type: 'COMMENT_REPLY',
        payload: {},
        readAt: null,
        createdAt: '2026-09-28T00:00:00.000Z',
      },
    ];
    seed.notifications = notifications;
    return seed;
  };

  it('returns the persona MeResponse with derived flags', async () => {
    const app = await createTestApp(meSeed());
    expect(await app.call<MeResponse>('GET', '/auth/me')).toEqual({
      id: FX_PERSONA,
      email: 'aria@example.test',
      displayName: 'Aria Wijaya',
      locale: 'en',
      isAdmin: true,
      role: 'admin',
      avatar: { initials: 'AW', bgColor: 'brand-blue', fgColor: 'ink-white' },
      hasPublishedAssets: true,
      unreadNotifications: 2,
      createdAt: '2025-06-12T00:00:00.000Z',
    });
    const other = await createTestApp(meSeed(), { meId: FX_OTHER });
    const me = await other.call<MeResponse>('GET', '/auth/me');
    expect(me).toMatchObject({
      id: FX_OTHER,
      isAdmin: false,
      role: 'contributor',
      hasPublishedAssets: true,
    });
    const third = await createTestApp(meSeed(), { meId: 'u-third' });
    expect(await third.call<MeResponse>('GET', '/auth/me')).toMatchObject({
      hasPublishedAssets: false,
    });
  });

  it('does not count draft-only ownership as published, and tracks reading notifications', async () => {
    const seed = meSeed();
    seed.assets = (seed.assets as AssetRecord[]).filter((a) => a.id !== 'a-mine');
    const app = await createTestApp(seed);
    expect((await app.call<MeResponse>('GET', '/auth/me')).hasPublishedAssets).toBe(false);
    await app.db.patch<NotificationRecord>('notifications', 'n-1', {
      readAt: '2026-10-01T00:00:00.000Z',
    });
    expect((await app.call<MeResponse>('GET', '/auth/me')).unreadNotifications).toBe(1);
  });

  it('PATCH /auth/me/locale validates, persists and returns the updated me', async () => {
    const app = await createTestApp(meSeed());
    const updated = await app.call<MeResponse>('PATCH', '/auth/me/locale', {
      body: { locale: 'id' },
    });
    expect(updated.locale).toBe('id');
    expect(updated.displayName).toBe('Aria Wijaya');
    expect((await app.call<MeResponse>('GET', '/auth/me')).locale).toBe('id');
    expect((await app.db.get<UserRecord>('users', FX_PERSONA))!.locale).toBe('id');
    for (const body of [{ locale: 'fr' }, {}, { locale: 3 }, null, 'id']) {
      await expect(
        app.call('PATCH', '/auth/me/locale', { body }),
        JSON.stringify(body),
      ).rejects.toSatisfy(status(400));
    }
    expect((await app.call<MeResponse>('GET', '/auth/me')).locale).toBe('id');
  });

  it('404s when the persona does not exist', async () => {
    const app = await createTestApp(fixtureCatalog(1), { meId: 'u-ghost' });
    await expect(app.call('GET', '/auth/me')).rejects.toSatisfy(status(404));
  });
});

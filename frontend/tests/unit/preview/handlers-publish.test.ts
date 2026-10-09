import { afterEach, describe, expect, it } from 'vitest';
import type {
  AssetDetail,
  AssetListPage,
  Category,
  DiscoverResponse,
  LibraryPage,
  MeResponse,
  Tag,
} from '@/lib/api/types';
import type { AssetRecord, TagRecord } from '@/preview/records';
import { slugifyTitle, uniqueSlug } from '@/preview/handlers/asset-write-core';
import {
  appForWrites,
  detail,
  doc,
  EMPTY_DOC,
  FX_OTHER,
  recordEvents,
  status,
  stored,
  storedOrThrow,
  tagBySlug,
  wizardCreateBody,
  type App,
} from './publish-fixtures';

const created = (app: App, body: Record<string, unknown> = wizardCreateBody()) =>
  app.call<{ id: string; slug: string }>('POST', '/assets', { body });

let stopRecording: (() => void) | undefined;
afterEach(() => stopRecording?.());
const record = () => {
  const r = recordEvents();
  stopRecording = r.stop;
  return r.events;
};

describe('slug helpers', () => {
  it('slugifyTitle follows the backend rules (lowercase, NFKD, no punctuation, hyphens)', () => {
    expect(slugifyTitle('Café Déjà Vu')).toBe('cafe-deja-vu');
    expect(slugifyTitle('  Hello -- World!!  ')).toBe('hello-world');
    expect(slugifyTitle('Low_Poly Props 2.0')).toBe('low_poly-props-20');
    expect(slugifyTitle('x'.repeat(200))).toHaveLength(80);
    expect(slugifyTitle(`${'a'.repeat(79)} b`)).toBe('a'.repeat(79));
  });

  it('falls back to "asset" when nothing survives (CJK, emoji, punctuation only)', () => {
    expect(slugifyTitle('日本語のアセット')).toBe('asset');
    expect(slugifyTitle('🔥🔥🔥')).toBe('asset');
    expect(slugifyTitle('!!!')).toBe('asset');
  });

  it('uniqueSlug appends -2, -3, ...', () => {
    expect(uniqueSlug('foo', new Set())).toBe('foo');
    expect(uniqueSlug('foo', new Set(['foo']))).toBe('foo-2');
    expect(uniqueSlug('foo', new Set(['foo', 'foo-2', 'foo-3']))).toBe('foo-4');
  });
});

describe('POST /assets', () => {
  it('creates a DRAFT owned by the persona and returns { id, slug }', async () => {
    const app = await appForWrites();
    const res = await created(app);
    expect(res.slug).toBe('my-new-asset');
    expect(res.id).toMatch(/^a-/);

    const a = await detail(app, res.id);
    expect(a).toMatchObject({
      id: res.id,
      slug: 'my-new-asset',
      title: 'My New Asset',
      engine: 'UNITY',
      status: 'DRAFT',
      publishedAt: null,
      owner: { id: 'u-persona', displayName: 'Aria Wijaya' },
      category: { id: 'cat-3d-models' },
      license: { id: 'lic-mit', name: 'MIT License' },
      thumbnail: { key: null, url: null },
      previewMedia: [],
      tags: [],
      totalDownloads: 0,
      totalSaves: 0,
      isSaved: false,
      canEdit: true,
      canDelete: true,
      canArchive: false,
      availableLocales: ['en'],
      shortDescription: '',
    });
    expect(a.versions).toHaveLength(1);
    expect(a.versions[0]).toMatchObject({
      semver: '1.0.0',
      isLatest: true,
      publishedAt: null,
      analysisStatus: 'PENDING',
      fileCount: 0,
      bytesTotal: '0',
      files: [],
      compatibility: [],
      dependencies: [],
      requiresEmptyProject: false,
    });
  });

  it('stores whole-second timestamps and never persists derived fields', async () => {
    const app = await appForWrites();
    const { id } = await created(app);
    const rec = (await storedOrThrow(app, id)) as unknown as Record<string, unknown>;
    expect(rec.createdAt).toMatch(/\.000Z$/);
    expect(rec.updatedAt).toBe(rec.createdAt);
    for (const derived of [
      'isSaved',
      'canEdit',
      'canDelete',
      'canArchive',
      'category',
      'license',
      'owner',
      'tags',
    ]) {
      expect(rec).not.toHaveProperty(derived);
    }
    expect(rec).toMatchObject({
      ownerId: 'u-persona',
      categoryId: 'cat-3d-models',
      licenseId: 'lic-mit',
      tagIds: [],
      storeName: '',
      storeUrl: '',
      viewCount: 0,
    });
  });

  it('uses -2, -3 for colliding slugs (also against deleted assets and ids)', async () => {
    const app = await appForWrites();
    expect((await created(app)).slug).toBe('my-new-asset');
    expect((await created(app)).slug).toBe('my-new-asset-2');
    expect((await created(app)).slug).toBe('my-new-asset-3');
    // `a-gone` is DELETED but its slug is still taken (unique constraint).
    expect((await created(app, wizardCreateBody({ title: 'Gone' }))).slug).toBe('gone-2');
    // The slug of fixture assets
    expect((await created(app, wizardCreateBody({ title: 'FX 001' }))).slug).toBe('fx-001-2');
    // A slug equal to an asset id would be shadowed by the id lookup.
    expect((await created(app, wizardCreateBody({ title: 'a-mine-pub' }))).slug).toBe(
      'a-mine-pub-2',
    );
  });

  it('handles unicode, long and boundary titles', async () => {
    const app = await appForWrites();
    expect((await created(app, wizardCreateBody({ title: 'Café Déjà Vu' }))).slug).toBe(
      'cafe-deja-vu',
    );
    const jp = await created(app, wizardCreateBody({ title: '日本語のアセット' }));
    expect(jp.slug).toBe('asset');
    expect((await detail(app, jp.id)).title).toBe('日本語のアセット');
    expect((await created(app, wizardCreateBody({ title: '日本語のアセット' }))).slug).toBe(
      'asset-2',
    );
    const max = await created(app, wizardCreateBody({ title: 'a'.repeat(140) }));
    expect(max.slug).toHaveLength(80);
    expect((await detail(app, max.id)).title).toHaveLength(140);
    expect((await created(app, wizardCreateBody({ title: 'abc' }))).slug).toBe('abc');
  });

  it('rejects empty, short and over-long titles with a field error', async () => {
    const app = await appForWrites();
    for (const title of ['', '  ', 'ab', 'x'.repeat(141), 5, null]) {
      const err = await created(app, wizardCreateBody({ title })).catch((e) => e);
      expect(err.status).toBe(400);
      expect(err.fields?.some((f: { path: string }) => f.path === 'title')).toBe(true);
    }
    expect(await app.db.list<AssetRecord>('assets')).toHaveLength(7);
  });

  it('validates engine, semver, translations and tags', async () => {
    const app = await appForWrites();
    const bad = async (over: Record<string, unknown>, path: string) => {
      const err = await created(app, wizardCreateBody(over)).catch((e) => e);
      expect(err.status, path).toBe(400);
      expect(
        err.fields.map((f: { path: string }) => f.path),
        path,
      ).toContain(path);
    };
    await bad({ engine: 'GODOT' }, 'engine');
    await bad({ semver: '1.0' }, 'semver');
    await bad({ semver: 'v1.0.0' }, 'semver');
    await bad({ categoryId: 5 }, 'categoryId');
    await bad({ translations: 'x' }, 'translations');
    await bad(
      {
        translations: [
          { locale: 'en', shortDescription: '', longDescription: EMPTY_DOC },
          { locale: 'id', shortDescription: '', longDescription: EMPTY_DOC },
          { locale: 'en', shortDescription: '', longDescription: EMPTY_DOC },
        ],
      },
      'translations',
    );
    await bad(
      { translations: [{ locale: 'fr', shortDescription: '', longDescription: EMPTY_DOC }] },
      'translations[0].locale',
    );
    await bad(
      {
        translations: [
          { locale: 'en', shortDescription: 'x'.repeat(281), longDescription: EMPTY_DOC },
        ],
      },
      'translations[0].shortDescription',
    );
    await bad({ tags: Array.from({ length: 31 }, (_, i) => `t${i}`) }, 'tags');
    await bad({ tags: [1] }, 'tags');
    await bad({ requiresEmptyProject: 'yes' }, 'requiresEmptyProject');
  });

  it('rejects disallowed TipTap content in the description', async () => {
    const app = await appForWrites();
    const err = await created(
      app,
      wizardCreateBody({
        translations: [
          {
            locale: 'en',
            shortDescription: 'ok',
            longDescription: { type: 'doc', content: [{ type: 'script' }] },
          },
        ],
      }),
    ).catch((e) => e);
    expect(err.status).toBe(400);
    expect(err.code).toBe('comment.long_tiptap_violation');
  });

  it('404s for an unknown category or license', async () => {
    const app = await appForWrites();
    await expect(created(app, wizardCreateBody({ categoryId: 'cat-nope' }))).rejects.toSatisfy(
      status(404, 'category.not_found'),
    );
    await expect(created(app, wizardCreateBody({ licenseId: 'lic-nope' }))).rejects.toSatisfy(
      status(404, 'license.not_found'),
    );
  });

  it('applies translations, tags and requiresEmptyProject', async () => {
    const app = await appForWrites();
    const { id } = await created(
      app,
      wizardCreateBody({
        translations: [
          { locale: 'en', shortDescription: 'Short en', longDescription: doc('Long en') },
          { locale: 'id', shortDescription: 'Singkat', longDescription: EMPTY_DOC },
        ],
        tags: ['lowpoly', 'Brand New'],
        requiresEmptyProject: true,
      }),
    );
    const en = await detail(app, id);
    expect(en.shortDescription).toBe('Short en');
    expect(en.longDescription).toEqual(doc('Long en'));
    expect(en.availableLocales).toEqual(['en', 'id']);
    expect(en.versions[0]!.requiresEmptyProject).toBe(true);
    expect(en.tags.map((t) => t.slug).sort()).toEqual(['brand-new', 'lowpoly']);
    const idLocale = await app.call<AssetDetail>('GET', `/assets/${id}`, { locale: 'id' });
    expect(idLocale.shortDescription).toBe('Singkat');
  });

  it('creates new tags and counts usage', async () => {
    const app = await appForWrites();
    const before = (await tagBySlug(app, 'lowpoly'))!.usageCount;
    await created(app, wizardCreateBody({ tags: ['lowpoly', 'Brand New', 'brand new', ' '] }));
    expect((await tagBySlug(app, 'lowpoly'))!.usageCount).toBe(before + 1);
    expect((await tagBySlug(app, 'lowpoly'))!.displayName).toBe('Low Poly');
    expect(await tagBySlug(app, 'brand-new')).toMatchObject({
      id: 'tag-brand-new',
      displayName: 'Brand New',
      usageCount: 1,
    });
    const tags = await app.call<Tag[]>('GET', '/tags', { query: { q: 'brand' } });
    expect(tags).toEqual([expect.objectContaining({ slug: 'brand-new', usageCount: 1 })]);
  });

  it('is a draft: absent from /assets, /discover and the public list, present for the owner', async () => {
    const app = await appForWrites();
    const { id } = await created(app);
    const pub = await app.call<AssetListPage>('GET', '/assets');
    expect(pub.items.map((a) => a.id)).not.toContain(id);
    const mine = await app.call<AssetListPage>('GET', '/assets', {
      query: { ownerId: 'u-persona', includeUnpublished: 'true' },
    });
    expect(mine.items.find((a) => a.id === id)).toMatchObject({
      status: 'DRAFT',
      title: 'My New Asset',
    });
    const discover = await app.call<DiscoverResponse>('GET', '/discover');
    expect(JSON.stringify(discover)).not.toContain(id);
    const cats = await app.call<Category[]>('GET', '/categories');
    expect(cats.find((c) => c.id === 'cat-3d-models')!.assetCount).toBe(3);
  });

  it('emits assets.changed', async () => {
    const app = await appForWrites();
    const events = record();
    await created(app);
    expect(events).toContainEqual({ type: 'assets.changed' });
  });
});

describe('PATCH /assets/{id}', () => {
  const patch = (app: App, id: string, body: unknown) =>
    app.call<undefined>('PATCH', `/assets/${id}`, { body });

  it('updates title (both i18n entries), keeps the slug, bumps updatedAt (whole seconds) and emits', async () => {
    const app = await appForWrites();
    app.ctx.now = () => new Date('2026-05-05T10:20:30.789Z');
    const events = record();
    expect(await patch(app, 'a-mine-draft', { title: 'Brand New Title' })).toBeUndefined();
    const a = await storedOrThrow(app, 'a-mine-draft');
    expect(a.title).toBe('Brand New Title');
    expect(a.titleI18n).toEqual({ en: 'Brand New Title', id: 'Brand New Title' });
    expect(a.slug).toBe('mine-draft');
    expect(a.updatedAt).toBe('2026-05-05T10:20:30.000Z');
    expect(a.createdAt).toBe('2026-03-01T00:00:00.000Z');
    expect(events).toContainEqual({ type: 'assets.changed' });
  });

  it('title changes never regenerate the slug, even for drafts', async () => {
    const app = await appForWrites();
    const { id, slug } = await created(app);
    await patch(app, id, { title: 'Something Else Entirely' });
    expect((await storedOrThrow(app, id)).slug).toBe(slug);
  });

  it('updates category, license, engine of a draft', async () => {
    const app = await appForWrites();
    await patch(app, 'a-mine-draft', {
      categoryId: 'cat-2d-art',
      licenseId: 'lic-cc0',
      engine: 'BLENDER',
    });
    const a = await detail(app, 'a-mine-draft');
    expect([a.category.id, a.license.id, a.engine]).toEqual(['cat-2d-art', 'lic-cc0', 'BLENDER']);
  });

  it('ignores empty category/license ids and unknown fields (like the backend)', async () => {
    const app = await appForWrites();
    await patch(app, 'a-mine-draft', {
      categoryId: '',
      licenseId: '',
      nonsense: 1,
      status: 'PUBLISHED',
    });
    const a = await storedOrThrow(app, 'a-mine-draft');
    expect([a.categoryId, a.licenseId, a.status]).toEqual(['cat-3d-models', 'lic-mit', 'DRAFT']);
  });

  it('404s for an unknown category or license', async () => {
    const app = await appForWrites();
    await expect(patch(app, 'a-mine-draft', { categoryId: 'cat-x' })).rejects.toSatisfy(
      status(404, 'category.not_found'),
    );
    await expect(patch(app, 'a-mine-draft', { licenseId: 'lic-x' })).rejects.toSatisfy(
      status(404, 'license.not_found'),
    );
  });

  it('validates field types and lengths', async () => {
    const app = await appForWrites();
    const bad = async (body: Record<string, unknown>, path: string) => {
      const err = await patch(app, 'a-mine-draft', body).catch((e) => e);
      expect(err.status, path).toBe(400);
      expect(
        err.fields.map((f: { path: string }) => f.path),
        path,
      ).toContain(path);
    };
    await bad({ title: 'ab' }, 'title');
    await bad({ title: 'x'.repeat(141) }, 'title');
    await bad({ title: 3 }, 'title');
    await bad({ slug: '' }, 'slug');
    await bad({ slug: 'has space' }, 'slug');
    await bad({ slug: 'a/b' }, 'slug');
    await bad({ slug: 'x'.repeat(121) }, 'slug');
    await bad({ engine: 'GODOT' }, 'engine');
    await bad({ semver: '' }, 'semver');
    await bad({ semver: 's'.repeat(41) }, 'semver');
    await bad({ requiresEmptyProject: 1 }, 'requiresEmptyProject');
    await bad({ tags: 'a' }, 'tags');
    await bad({ translations: [{ locale: 'xx' }] }, 'translations[0].locale');
    await bad({ previewMedia: 'x' }, 'previewMedia');
    await bad(
      { previewMedia: [{ id: 'p', kind: 'gif', key: 'k', label: 'l' }] },
      'previewMedia[0].kind',
    );
    await bad(
      {
        previewMedia: Array.from({ length: 25 }, (_, i) => ({
          id: `p${i}`,
          kind: 'image',
          key: 'k',
          label: 'l',
        })),
      },
      'previewMedia',
    );
    expect((await app.call<AssetDetail>('GET', '/assets/a-mine-draft')).title).toBe('Mine Draft');
  });

  it('rejects a non-object body', async () => {
    const app = await appForWrites();
    await expect(patch(app, 'a-mine-draft', 'x')).rejects.toSatisfy(status(400));
    await expect(patch(app, 'a-mine-draft', null)).rejects.toSatisfy(status(400));
    await expect(patch(app, 'a-mine-draft', [])).rejects.toSatisfy(status(400));
  });

  it('an empty patch changes nothing (no updatedAt bump, no event)', async () => {
    const app = await appForWrites();
    const events = record();
    const before = await storedOrThrow(app, 'a-mine-draft');
    await patch(app, 'a-mine-draft', {});
    expect(await storedOrThrow(app, 'a-mine-draft')).toEqual(before);
    expect(events).toEqual([]);
  });

  describe('slug', () => {
    it('can be changed on a draft; collisions are 409 asset.slug_taken', async () => {
      const app = await appForWrites();
      await patch(app, 'a-mine-draft', { slug: 'custom-slug_1' });
      expect((await detail(app, 'custom-slug_1')).id).toBe('a-mine-draft');
      await expect(patch(app, 'a-mine-draft', { slug: 'fx-001' })).rejects.toSatisfy(
        status(409, 'asset.slug_taken'),
      );
      await expect(patch(app, 'a-mine-draft', { slug: 'a-mine-pub' })).rejects.toSatisfy(
        status(409, 'asset.slug_taken'),
      );
      // Re-sending the asset's own slug is fine.
      await expect(patch(app, 'a-mine-draft', { slug: 'custom-slug_1' })).resolves.toBeUndefined();
    });

    it('is locked after publish (400 asset.publish_blocked), unless unchanged', async () => {
      const app = await appForWrites();
      await expect(patch(app, 'a-mine-pub', { slug: 'new-slug' })).rejects.toSatisfy(
        status(400, 'asset.publish_blocked'),
      );
      await expect(
        patch(app, 'a-mine-pub', { slug: 'mine-pub', title: 'Renamed Pub' }),
      ).resolves.toBeUndefined();
      const a = await storedOrThrow(app, 'a-mine-pub');
      expect([a.slug, a.title]).toEqual(['mine-pub', 'Renamed Pub']);
    });
  });

  describe('engine and semver locks', () => {
    it('engine is locked after publish but the same value is accepted', async () => {
      const app = await appForWrites();
      await expect(patch(app, 'a-mine-pub', { engine: 'UNREAL' })).rejects.toSatisfy(
        status(400, 'asset.publish_blocked'),
      );
      await expect(patch(app, 'a-mine-pub', { engine: 'UNITY' })).resolves.toBeUndefined();
    });

    it('semver is routed to the latest version, validated and unique', async () => {
      const app = await appForWrites();
      await patch(app, 'a-mine-draft', { semver: '2.1.0-beta.1' });
      expect((await storedOrThrow(app, 'a-mine-draft')).versions[0]!.semver).toBe('2.1.0-beta.1');
      await expect(patch(app, 'a-mine-draft', { semver: 'one' })).rejects.toSatisfy(
        status(400, 'asset.publish_blocked'),
      );
      await expect(patch(app, 'a-mine-draft', { semver: '2.1.0-beta.1' })).resolves.toBeUndefined();
    });

    it('semver is locked once the version is published; duplicates are 409', async () => {
      const app = await appForWrites();
      await expect(patch(app, 'a-mine-pub', { semver: '9.9.9' })).rejects.toSatisfy(
        status(400, 'asset.publish_blocked'),
      );
      const draft = await storedOrThrow(app, 'a-mine-draft');
      await app.db.patch<AssetRecord>('assets', 'a-mine-draft', {
        versions: [
          { ...draft.versions[0]!, id: 'v-old', semver: '0.9.0', isLatest: false },
          {
            ...draft.versions[0]!,
            id: 'v-new',
            semver: '1.0.0',
            createdAt: '2026-04-01T00:00:00.000Z',
          },
        ],
      });
      await expect(patch(app, 'a-mine-draft', { semver: '0.9.0' })).rejects.toSatisfy(
        status(409, 'version.duplicate'),
      );
    });

    it('requiresEmptyProject applies to the asset versions', async () => {
      const app = await appForWrites();
      await patch(app, 'a-mine-draft', { requiresEmptyProject: true });
      expect((await detail(app, 'a-mine-draft')).versions[0]!.requiresEmptyProject).toBe(true);
      await patch(app, 'a-mine-draft', { requiresEmptyProject: false });
      expect((await detail(app, 'a-mine-draft')).versions[0]!.requiresEmptyProject).toBe(false);
    });
  });

  describe('translations', () => {
    it('en overwrites short and long description; availableLocales stays', async () => {
      const app = await appForWrites();
      await patch(app, 'a-mine-draft', {
        translations: [
          { locale: 'en', shortDescription: 'New short', longDescription: doc('Long') },
        ],
      });
      const a = await detail(app, 'a-mine-draft');
      expect(a.shortDescription).toBe('New short');
      expect(a.longDescription).toEqual(doc('Long'));
      expect(a.availableLocales).toEqual(['en', 'id']);
    });

    it('an empty id translation (what the wizard always sends) does not wipe existing Indonesian text', async () => {
      const app = await appForWrites();
      await patch(app, 'a-mine-draft', {
        translations: [
          { locale: 'en', shortDescription: 'EN text', longDescription: doc('x') },
          { locale: 'id', shortDescription: '', longDescription: EMPTY_DOC },
        ],
      });
      const rec = await storedOrThrow(app, 'a-mine-draft');
      expect(rec.shortDescriptionI18n.id).toMatch(/^Teks singkat/);
      expect(rec.availableLocales).toEqual(['en', 'id']);
      // ... but non-empty Indonesian text is saved.
      await patch(app, 'a-mine-draft', {
        translations: [{ locale: 'id', shortDescription: 'Teks baru', longDescription: EMPTY_DOC }],
      });
      expect((await storedOrThrow(app, 'a-mine-draft')).shortDescriptionI18n.id).toBe('Teks baru');
    });

    it('an English translation can be cleared, and adding id adds the locale', async () => {
      const app = await appForWrites();
      const { id } = await created(app);
      await patch(app, id, {
        translations: [
          { locale: 'en', shortDescription: '', longDescription: EMPTY_DOC },
          { locale: 'id', shortDescription: '', longDescription: EMPTY_DOC },
        ],
      });
      expect((await storedOrThrow(app, id)).availableLocales).toEqual(['en']);
      await patch(app, id, {
        translations: [{ locale: 'id', shortDescription: 'Halo', longDescription: EMPTY_DOC }],
      });
      expect((await storedOrThrow(app, id)).availableLocales).toEqual(['en', 'id']);
    });

    it('rejects disallowed content atomically (nothing else is saved)', async () => {
      const app = await appForWrites();
      const err = await patch(app, 'a-mine-draft', {
        title: 'Should Not Stick',
        tags: ['atomic-tag'],
        translations: [
          {
            locale: 'en',
            shortDescription: 's',
            longDescription: { type: 'doc', content: [{ type: 'iframe' }] },
          },
        ],
      }).catch((e) => e);
      expect(err.status).toBe(400);
      expect(err.code).toBe('comment.long_tiptap_violation');
      expect((await storedOrThrow(app, 'a-mine-draft')).title).toBe('Mine Draft');
      expect(await tagBySlug(app, 'atomic-tag')).toBeUndefined();
    });
  });

  describe('tags (the wizard sends slugs)', () => {
    it('adds existing and new tags, updating usageCount and /tags', async () => {
      const app = await appForWrites();
      const lava0 = (await tagBySlug(app, 'lava'))!.usageCount;
      const pixel0 = (await tagBySlug(app, 'pixel'))!.usageCount;
      await patch(app, 'a-mine-draft', { tags: ['lava', 'pixel', 'my-new-tag'] });
      const a = await detail(app, 'a-mine-draft');
      expect(a.tags.map((t) => t.slug)).toEqual(['lava', 'pixel', 'my-new-tag']);
      expect((await tagBySlug(app, 'lava'))!.usageCount).toBe(lava0 + 1);
      expect((await tagBySlug(app, 'pixel'))!.usageCount).toBe(pixel0 + 1);
      expect(await tagBySlug(app, 'my-new-tag')).toMatchObject({
        id: 'tag-my-new-tag',
        displayName: 'my-new-tag',
        usageCount: 1,
      });
      const listed = await app.call<Tag[]>('GET', '/tags', { query: { q: 'my-' } });
      expect(listed.map((t) => t.slug)).toEqual(['my-new-tag']);
    });

    it('removed tags decrement (floor 0); unchanged ones are untouched', async () => {
      const app = await appForWrites();
      const lava0 = (await tagBySlug(app, 'lava'))!.usageCount;
      // a-mine-pub has tag-lava.
      await patch(app, 'a-mine-pub', { tags: ['pixel'] });
      expect((await tagBySlug(app, 'lava'))!.usageCount).toBe(lava0 - 1);
      await patch(app, 'a-mine-pub', { tags: ['pixel'] });
      expect((await tagBySlug(app, 'pixel'))!.usageCount).toBe(10);
      await patch(app, 'a-mine-pub', { tags: [] });
      expect((await detail(app, 'a-mine-pub')).tags).toEqual([]);
      // 'unused' has usageCount 0 and is not on the asset: removal can never go negative.
      await app.db.patch<TagRecord>('tags', 'tag-pixel', { usageCount: 0 });
      await patch(app, 'a-mine-pub', { tags: ['pixel'] });
      await app.db.patch<TagRecord>('tags', 'tag-pixel', { usageCount: 0 });
      await patch(app, 'a-mine-pub', { tags: [] });
      expect((await tagBySlug(app, 'pixel'))!.usageCount).toBe(0);
    });

    it('dedupes, trims, matches by slug and never renames an existing tag', async () => {
      const app = await appForWrites();
      await patch(app, 'a-mine-draft', {
        tags: ['lowpoly', ' lowpoly ', 'LOWPOLY', 'LAVA', '', '!!!'],
      });
      const a = await detail(app, 'a-mine-draft');
      expect(a.tags.map((t) => t.slug).sort()).toEqual(['lava', 'lowpoly']);
      expect((await tagBySlug(app, 'lowpoly'))!.displayName).toBe('Low Poly');
      expect((await tagBySlug(app, 'lowpoly'))!.usageCount).toBe(6);
    });
  });

  describe('previewMedia', () => {
    const item = (id: string, over: Record<string, unknown> = {}) => ({
      id,
      kind: 'image',
      key: `editor/${id}.png`,
      displayKey: `editor/${id}-d.webp`,
      label: `${id}.png`,
      mime: 'image/png',
      viewUrl: `blob:view-${id}`,
      originalUrl: `blob:orig-${id}`,
      ...over,
    });

    it('stores the list in order with visibility and warning, keeping the client URLs', async () => {
      const app = await appForWrites();
      await patch(app, 'a-mine-draft', {
        previewMedia: [
          item('p1'),
          item('p2', { visibility: 'blur', warning: 'Spoilers' }),
          item('p3', { visibility: 'hidden' }),
        ],
      });
      const a = await detail(app, 'a-mine-draft');
      expect(a.previewMedia.map((m) => m.id)).toEqual(['p1', 'p2', 'p3']);
      expect(a.previewMedia[0]).toMatchObject({
        viewUrl: 'blob:view-p1',
        originalUrl: 'blob:orig-p1',
        displayKey: 'editor/p1-d.webp',
      });
      expect(a.previewMedia[1]).toMatchObject({ visibility: 'blur', warning: 'Spoilers' });
      expect(a.previewMedia[2]!.visibility).toBe('hidden');
      // reorder + remove
      await patch(app, 'a-mine-draft', { previewMedia: [item('p3'), item('p1')] });
      expect((await detail(app, 'a-mine-draft')).previewMedia.map((m) => m.id)).toEqual([
        'p3',
        'p1',
      ]);
      await patch(app, 'a-mine-draft', { previewMedia: [] });
      expect((await detail(app, 'a-mine-draft')).previewMedia).toEqual([]);
    });

    it('falls back to a thumbs path or the key when no viewUrl is sent', async () => {
      const app = await appForWrites();
      await patch(app, 'a-mine-draft', {
        previewMedia: [
          { id: 'q1', kind: 'image', key: 'thumbs/x.webp', label: 'x' },
          { id: 'q2', kind: 'video', key: 'editor/v.mp4', label: 'v' },
        ],
      });
      const rec = await storedOrThrow(app, 'a-mine-draft');
      expect(rec.previewMedia.map((m) => m.viewUrl)).toEqual(['/thumbs/x.webp', 'editor/v.mp4']);
    });
  });

  describe('authorization', () => {
    it('404s for unknown and deleted assets', async () => {
      const app = await appForWrites();
      await expect(patch(app, 'a-nope', { title: 'Hello there' })).rejects.toSatisfy(
        status(404, 'asset.not_found'),
      );
      await expect(patch(app, 'a-gone', { title: 'Hello there' })).rejects.toSatisfy(
        status(404, 'asset.not_found'),
      );
    });

    it("another user's DRAFT is a 404 and their PUBLISHED asset a 403 (non-admin)", async () => {
      const app = await appForWrites({ meId: FX_OTHER });
      // u-other (non-admin) vs the persona's assets
      await expect(patch(app, 'a-mine-draft', { title: 'Hello there' })).rejects.toSatisfy(
        status(404, 'asset.not_found'),
      );
      await expect(patch(app, 'a-mine-pub', { title: 'Hello there' })).rejects.toSatisfy(
        status(403, 'auth.forbidden'),
      );
      // ... and their own draft works.
      await expect(patch(app, 'a-other-draft', { title: 'Hello there' })).resolves.toBeUndefined();
    });

    it("an admin can edit other people's drafts and published assets", async () => {
      const app = await appForWrites();
      await expect(patch(app, 'a-other-draft', { title: 'Admin edit' })).resolves.toBeUndefined();
      await expect(patch(app, 'a-fx-001', { title: 'Admin edit 2' })).resolves.toBeUndefined();
      expect((await storedOrThrow(app, 'a-fx-001')).title).toBe('Admin edit 2');
    });

    it('accepts the slug as the identifier', async () => {
      const app = await appForWrites();
      await patch(app, 'mine-draft', { title: 'Via slug' });
      expect((await storedOrThrow(app, 'a-mine-draft')).title).toBe('Via slug');
    });
  });

  describe('concurrency', () => {
    it('overlapping PATCHes that rewrite the same arrays all land', async () => {
      const app = await appForWrites();
      await Promise.all([
        patch(app, 'a-mine-draft', { title: 'First Writer' }),
        patch(app, 'a-mine-draft', { requiresEmptyProject: true }),
        patch(app, 'a-mine-draft', { semver: '3.0.0' }),
        patch(app, 'a-mine-draft', { tags: ['pixel'] }),
        patch(app, 'a-mine-draft', { tags: ['pixel', 'lava'] }),
        patch(app, 'a-mine-draft', {
          translations: [
            { locale: 'en', shortDescription: 'Last writer', longDescription: EMPTY_DOC },
          ],
        }),
      ]);
      const a = await storedOrThrow(app, 'a-mine-draft');
      expect(a.title).toBe('First Writer');
      expect(a.versions[0]).toMatchObject({ semver: '3.0.0', requiresEmptyProject: true });
      expect(a.tagIds).toEqual(['tag-pixel', 'tag-lava']);
      expect(a.shortDescription).toBe('Last writer');
      // 9 + 1 and 2 + 1: counted once each, in request order.
      expect((await tagBySlug(app, 'pixel'))!.usageCount).toBe(10);
      expect((await tagBySlug(app, 'lava'))!.usageCount).toBe(3);
    });

    it('a failing request does not block the queue', async () => {
      const app = await appForWrites();
      const results = await Promise.allSettled([
        patch(app, 'a-mine-draft', { title: 'ab' }),
        patch(app, 'a-mine-draft', { title: 'Still works' }),
      ]);
      expect(results.map((r) => r.status)).toEqual(['rejected', 'fulfilled']);
      expect((await storedOrThrow(app, 'a-mine-draft')).title).toBe('Still works');
    });
  });
});

describe('DELETE /assets/{id}', () => {
  const del = (app: App, id: string) => app.call<undefined>('DELETE', `/assets/${id}`);

  it('soft-deletes: status DELETED, 404 on detail, gone from every list', async () => {
    const app = await appForWrites();
    await app.call('POST', '/library/items', { body: { assetId: 'a-mine-pub' } });
    expect((await app.call<LibraryPage>('GET', '/library')).items.map((i) => i.asset.id)).toContain(
      'a-mine-pub',
    );
    const events = record();

    expect(await del(app, 'a-mine-pub')).toBeUndefined();
    expect((await storedOrThrow(app, 'a-mine-pub')).status).toBe('DELETED');
    await expect(detail(app, 'a-mine-pub')).rejects.toSatisfy(status(404, 'asset.not_found'));
    await expect(detail(app, 'mine-pub')).rejects.toSatisfy(status(404, 'asset.not_found'));
    for (const q of [
      {},
      { status: 'DELETED' },
      { ownerId: 'u-persona', includeUnpublished: 'true' },
      { q: 'Mine Published' },
    ]) {
      const list = await app.call<AssetListPage>('GET', '/assets', { query: q });
      expect(list.items.map((a) => a.id)).not.toContain('a-mine-pub');
    }
    expect(JSON.stringify(await app.call('GET', '/discover'))).not.toContain('a-mine-pub');
    expect(
      (await app.call<LibraryPage>('GET', '/library')).items.map((i) => i.asset.id),
    ).not.toContain('a-mine-pub');
    const hits = await app.call<{ hits: { id: string }[] }>('GET', '/search/assets', {
      query: { q: 'Mine' },
    });
    expect(hits.hits.map((h) => h.id)).not.toContain('a-mine-pub');
    expect(events).toContainEqual({ type: 'assets.changed' });
    // second delete: it is gone
    await expect(del(app, 'a-mine-pub')).rejects.toSatisfy(status(404));
  });

  it('drops the asset from category counts and /auth/me', async () => {
    const app = await appForWrites();
    const count = async () =>
      (await app.call<Category[]>('GET', '/categories')).find((c) => c.id === 'cat-3d-models')!
        .assetCount;
    const before = await count();
    await del(app, 'a-mine-pub');
    expect(await count()).toBe(before - 1);
    expect((await app.call<MeResponse>('GET', '/auth/me')).hasPublishedAssets).toBe(false);
  });

  it('decrements tag usage and updates updatedAt', async () => {
    const app = await appForWrites();
    app.ctx.now = () => new Date('2026-06-06T06:06:06.500Z');
    const lava0 = (await tagBySlug(app, 'lava'))!.usageCount;
    await del(app, 'a-mine-pub');
    expect((await tagBySlug(app, 'lava'))!.usageCount).toBe(lava0 - 1);
    expect((await storedOrThrow(app, 'a-mine-pub')).updatedAt).toBe('2026-06-06T06:06:06.000Z');
  });

  it('can delete a draft', async () => {
    const app = await appForWrites();
    await del(app, 'a-mine-draft');
    await expect(detail(app, 'a-mine-draft')).rejects.toSatisfy(status(404));
  });

  it('authorization: other draft 404, other published 403, admin may delete', async () => {
    const non = await appForWrites({ meId: FX_OTHER });
    await expect(del(non, 'a-mine-draft')).rejects.toSatisfy(status(404));
    await expect(del(non, 'a-mine-pub')).rejects.toSatisfy(status(403, 'auth.forbidden'));
    await expect(del(non, 'a-other-draft')).resolves.toBeUndefined();
    const admin = await appForWrites();
    await expect(del(admin, 'a-fx-001')).resolves.toBeUndefined();
    await expect(del(admin, 'a-nope')).rejects.toSatisfy(status(404));
  });
});

describe('POST /assets/{id}/publish', () => {
  const publish = (app: App, id: string) =>
    app.call<{ warnings: unknown[] }>('POST', `/assets/${id}/publish`, { body: {} });

  it('publishes a complete draft: status, publishedAt, version, lists, counters', async () => {
    const app = await appForWrites();
    app.ctx.now = () => new Date('2026-07-07T07:07:07.900Z');
    const events = record();
    const catBefore = (await app.call<Category[]>('GET', '/categories')).find(
      (c) => c.id === 'cat-3d-models',
    )!.assetCount;

    expect(await publish(app, 'a-mine-draft')).toEqual({ warnings: [] });

    const a = await storedOrThrow(app, 'a-mine-draft');
    expect(a.status).toBe('PUBLISHED');
    expect(a.publishedAt).toBe('2026-07-07T07:07:07.000Z');
    expect(a.updatedAt).toBe('2026-07-07T07:07:07.000Z');
    expect(a.versions[0]).toMatchObject({
      publishedAt: '2026-07-07T07:07:07.000Z',
      isLatest: true,
    });
    const d = await detail(app, 'a-mine-draft');
    expect(d).toMatchObject({ status: 'PUBLISHED', canArchive: true });
    const pub = await app.call<AssetListPage>('GET', '/assets', { query: { sort: 'newest' } });
    expect(pub.items[0]!.id).toBe('a-mine-draft');
    const cats = await app.call<Category[]>('GET', '/categories');
    expect(cats.find((c) => c.id === 'cat-3d-models')!.assetCount).toBe(catBefore + 1);
    expect(events).toContainEqual({ type: 'assets.changed' });
  });

  it('end to end: create -> patch -> publish blocked until complete', async () => {
    const app = await appForWrites();
    const { id } = await created(app);
    await app.call('PATCH', `/assets/${id}`, {
      body: {
        title: 'E2E Asset',
        tags: ['e2e'],
        translations: [{ locale: 'en', shortDescription: 'Short', longDescription: doc('Long') }],
      },
    });
    const err = await publish(app, id).catch((e) => e);
    expect(err.status).toBe(400);
    expect(err.code).toBe('asset.publish_blocked');
    expect(err.fields.map((f: { code: string }) => f.code)).toEqual([
      'thumbnail.missing',
      'version.empty',
      'compatibility.missing',
    ]);
    expect((await storedOrThrow(app, id)).status).toBe('DRAFT');
  });

  it('blocked publishes carry { path, code, message } fields the wizard maps to steps', async () => {
    const app = await appForWrites();
    const cases: [Partial<AssetRecord>, string, string][] = [
      [{ thumbnail: { key: null, url: null } }, 'thumbnail', 'thumbnail.missing'],
      [{ licenseId: '' }, 'license', 'license.missing'],
    ];
    for (const [over, path, code] of cases) {
      await app.db.patch<AssetRecord>('assets', 'a-mine-draft', over);
      const err = await publish(app, 'a-mine-draft').catch((e) => e);
      expect(err.status).toBe(400);
      expect(err.code).toBe('asset.publish_blocked');
      expect(err.fields[0]).toEqual({ path, code, message: expect.any(String) });
      await app.db.patch<AssetRecord>('assets', 'a-mine-draft', {
        thumbnail: { key: 't', url: '/t' },
        licenseId: 'lic-mit',
      });
    }
    const draft = await storedOrThrow(app, 'a-mine-draft');
    await app.db.patch<AssetRecord>('assets', 'a-mine-draft', {
      versions: [{ ...draft.versions[0]!, files: [], fileCount: 0, bytesTotal: '0' }],
    });
    const err = await publish(app, 'a-mine-draft').catch((e) => e);
    expect(err.fields[0].path.startsWith('version.files')).toBe(true);
  });

  it('re-publishing a published asset ("Update") keeps publishedAt', async () => {
    const app = await appForWrites();
    const before = (await storedOrThrow(app, 'a-mine-pub')).publishedAt;
    app.ctx.now = () => new Date('2027-01-01T00:00:00.000Z');
    await publish(app, 'a-mine-pub');
    const a = await storedOrThrow(app, 'a-mine-pub');
    expect(a.publishedAt).toBe(before);
    expect(a.status).toBe('PUBLISHED');
  });

  it('publishes the newest unpublished version and makes it the only latest', async () => {
    const app = await appForWrites();
    const pub = await storedOrThrow(app, 'a-mine-pub');
    await app.db.patch<AssetRecord>('assets', 'a-mine-pub', {
      versions: [
        pub.versions[0]!,
        {
          ...pub.versions[0]!,
          id: 'v-next',
          semver: '1.1.0',
          isLatest: false,
          publishedAt: null,
          createdAt: '2026-08-01T00:00:00.000Z',
        },
      ],
    });
    app.ctx.now = () => new Date('2026-09-09T09:09:09.000Z');
    await publish(app, 'a-mine-pub');
    const a = await storedOrThrow(app, 'a-mine-pub');
    expect(a.versions.filter((v) => v.isLatest).map((v) => v.id)).toEqual(['v-next']);
    expect(a.versions[1]!.publishedAt).toBe('2026-09-09T09:09:09.000Z');
  });

  it('refuses archived assets, 404s deleted ones, and enforces ownership', async () => {
    const app = await appForWrites();
    await app.call('POST', '/assets/a-mine-pub/archive');
    await expect(publish(app, 'a-mine-pub')).rejects.toSatisfy(
      status(400, 'asset.publish_blocked'),
    );
    await expect(publish(app, 'a-gone')).rejects.toSatisfy(status(404));
    const non = await appForWrites({ meId: FX_OTHER });
    await expect(publish(non, 'a-mine-draft')).rejects.toSatisfy(status(404));
    await expect(publish(non, 'a-mine-pub')).rejects.toSatisfy(status(403));
  });
});

describe('POST /assets/{id}/archive and /restore', () => {
  const archive = (app: App, id: string) => app.call<undefined>('POST', `/assets/${id}/archive`);
  const restore = (app: App, id: string) => app.call<undefined>('POST', `/assets/${id}/restore`);

  it('toggles status and canArchive, hides from public lists, keeps the detail for the owner', async () => {
    const app = await appForWrites();
    const events = record();
    expect((await detail(app, 'a-mine-pub')).canArchive).toBe(true);

    expect(await archive(app, 'a-mine-pub')).toBeUndefined();
    const arch = await detail(app, 'a-mine-pub');
    expect(arch).toMatchObject({ status: 'ARCHIVED', canArchive: false, canEdit: true });
    const pub = await app.call<AssetListPage>('GET', '/assets');
    expect(pub.items.map((a) => a.id)).not.toContain('a-mine-pub');
    const mine = await app.call<AssetListPage>('GET', '/assets', {
      query: { ownerId: 'u-persona', status: 'ARCHIVED' },
    });
    expect(mine.items.map((a) => a.id)).toEqual(['a-mine-pub']);
    expect(JSON.stringify(await app.call('GET', '/discover'))).not.toContain('a-mine-pub');

    expect(await restore(app, 'a-mine-pub')).toBeUndefined();
    expect(await detail(app, 'a-mine-pub')).toMatchObject({
      status: 'PUBLISHED',
      canArchive: true,
    });
    expect((await app.call<AssetListPage>('GET', '/assets')).items.map((a) => a.id)).toContain(
      'a-mine-pub',
    );
    expect(events.filter((e) => e.type === 'assets.changed').length).toBeGreaterThanOrEqual(2);
  });

  it('archived assets leave the library view and return on restore; save counters survive', async () => {
    const app = await appForWrites();
    await app.call('POST', '/library/items', { body: { assetId: 'a-mine-pub' } });
    const saves = (await storedOrThrow(app, 'a-mine-pub')).totalSaves;
    await archive(app, 'a-mine-pub');
    expect((await app.call<LibraryPage>('GET', '/library')).items).toEqual([]);
    await restore(app, 'a-mine-pub');
    expect((await app.call<LibraryPage>('GET', '/library')).items.map((i) => i.asset.id)).toEqual([
      'a-mine-pub',
    ]);
    expect((await storedOrThrow(app, 'a-mine-pub')).totalSaves).toBe(saves);
  });

  it('updates /auth/me.hasPublishedAssets and category counts', async () => {
    const app = await appForWrites();
    const count = async () =>
      (await app.call<Category[]>('GET', '/categories')).find((c) => c.id === 'cat-3d-models')!
        .assetCount;
    const before = await count();
    expect((await app.call<MeResponse>('GET', '/auth/me')).hasPublishedAssets).toBe(true);
    await archive(app, 'a-mine-pub');
    expect((await app.call<MeResponse>('GET', '/auth/me')).hasPublishedAssets).toBe(false);
    expect(await count()).toBe(before - 1);
    await restore(app, 'a-mine-pub');
    expect((await app.call<MeResponse>('GET', '/auth/me')).hasPublishedAssets).toBe(true);
    expect(await count()).toBe(before);
  });

  it('archive needs a PUBLISHED asset, restore an ARCHIVED one (400 asset.archive_blocked)', async () => {
    const app = await appForWrites();
    await expect(archive(app, 'a-mine-draft')).rejects.toSatisfy(
      status(400, 'asset.archive_blocked'),
    );
    await expect(restore(app, 'a-mine-pub')).rejects.toSatisfy(
      status(400, 'asset.archive_blocked'),
    );
    await archive(app, 'a-mine-pub');
    await expect(archive(app, 'a-mine-pub')).rejects.toSatisfy(
      status(400, 'asset.archive_blocked'),
    );
  });

  it('restore keeps publishedAt and bumps updatedAt', async () => {
    const app = await appForWrites();
    const before = await storedOrThrow(app, 'a-mine-pub');
    await archive(app, 'a-mine-pub');
    app.ctx.now = () => new Date('2026-10-10T10:10:10.000Z');
    await restore(app, 'a-mine-pub');
    const a = await storedOrThrow(app, 'a-mine-pub');
    expect(a.publishedAt).toBe(before.publishedAt);
    expect(a.updatedAt).toBe('2026-10-10T10:10:10.000Z');
  });

  it('authorization and missing assets', async () => {
    const non = await appForWrites({ meId: FX_OTHER });
    await expect(archive(non, 'a-mine-pub')).rejects.toSatisfy(status(403, 'auth.forbidden'));
    await expect(archive(non, 'a-mine-draft')).rejects.toSatisfy(status(404));
    await expect(archive(non, 'a-nope')).rejects.toSatisfy(status(404));
    await expect(restore(non, 'a-gone')).rejects.toSatisfy(status(404));
    const admin = await appForWrites();
    await expect(archive(admin, 'a-fx-001')).resolves.toBeUndefined();
    expect(await stored(admin, 'a-fx-001')).toMatchObject({ status: 'ARCHIVED' });
  });
});

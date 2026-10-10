import { beforeEach, describe, expect, it } from 'vitest';
import type { AdminCategory } from '@/lib/api/admin-types';
import type { Category, DiscoverResponse } from '@/lib/api/types';
import type { AssetRecord, CategoryRecord } from '@/preview/records';
import { getBlobStore } from '@/preview/uploads/blob-store';
import { assetsApp, newAudits, status } from './admin-fixtures';

type App = Awaited<ReturnType<typeof assetsApp>>;

const list = (app: App) => app.call<AdminCategory[]>('GET', '/admin/categories');
const create = (app: App, body: Record<string, unknown>) =>
  app.call<AdminCategory>('POST', '/admin/categories', { body });
const update = (app: App, id: string, body: Record<string, unknown>) =>
  app.call<AdminCategory>('PATCH', `/admin/categories/${id}`, { body });
const remove = (app: App, id: string) => app.call('DELETE', `/admin/categories/${id}`);
const reorder = (app: App, body: unknown) =>
  app.call('POST', '/admin/categories/reorder', { body });
const pub = (app: App, locale: 'en' | 'id' = 'en') =>
  app.call<Category[]>('GET', '/categories', { locale });
const discover = (app: App) => app.call<DiscoverResponse>('GET', '/discover');
const stored = async (app: App, id: string) =>
  (await app.db.get<CategoryRecord>('categories', id)) as CategoryRecord;
const ids = (rows: Array<{ id: string }>) => rows.map((r) => r.id);

beforeEach(async () => {
  await getBlobStore().clear();
});

describe('GET /admin/categories', () => {
  it('lists every category with the AdminCategory shape and non-deleted asset counts', async () => {
    const app = await assetsApp();
    const rows = await list(app);
    expect(ids(rows)).toEqual(['cat-3d-models', 'cat-2d-art', 'cat-empty']);
    expect(rows[1]).toEqual({
      id: 'cat-2d-art',
      slug: '2d-art',
      name: { en: '2D Art & Sprites', id: 'Seni 2D & Sprite' },
      iconKey: 'image',
      iconUrl: null,
      sortOrder: 20,
      isActive: true,
      assetCount: 1,
      createdAt: '2025-01-15T00:00:00.000Z',
      updatedAt: '2025-01-15T00:00:00.000Z',
    });
    // 3d: a-fx-001, a-fx-003, a-mine, a-arch (ARCHIVED), a-draft (DRAFT); a-gone is DELETED
    expect(rows.map((r) => r.assetCount)).toEqual([5, 1, 0]);
  });

  it('puts inactive categories last', async () => {
    const app = await assetsApp();
    await update(app, 'cat-3d-models', { isActive: false });
    expect(ids(await list(app))).toEqual(['cat-2d-art', 'cat-empty', 'cat-3d-models']);
  });
});

describe('POST /admin/categories', () => {
  it('creates a category at the end and audits it', async () => {
    const app = await assetsApp();
    const res = await create(app, {
      slug: 'audio-fx',
      name: { en: 'Audio FX', id: 'Efek Audio' },
      isActive: true,
    });
    expect(res).toEqual({
      id: 'cat-audio-fx',
      slug: 'audio-fx',
      name: { en: 'Audio FX', id: 'Efek Audio' },
      iconKey: null,
      iconUrl: null,
      sortOrder: 31,
      isActive: true,
      assetCount: 0,
      createdAt: '2026-06-10T12:00:00.000Z',
      updatedAt: '2026-06-10T12:00:00.000Z',
    });
    expect(ids(await list(app)).at(-1)).toBe('cat-audio-fx');
    const rows = await newAudits(app);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: 'category.create',
      subjectType: 'Category',
      subjectId: 'cat-audio-fx',
      metadata: { slug: 'audio-fx' },
    });
  });

  it('takes iconKey, sortOrder and isActive, and derives the slug from the English name', async () => {
    const app = await assetsApp();
    const res = await create(app, {
      name: { en: 'Level Design Kits', id: 'Kit Desain Level' },
      iconKey: 'map',
      sortOrder: 5,
      isActive: false,
    });
    expect(res).toMatchObject({
      slug: 'level-design-kits',
      iconKey: 'map',
      sortOrder: 5,
      isActive: false,
    });
  });

  it('refuses a slug that is already taken with 409 category.in_use', async () => {
    const app = await assetsApp();
    await expect(
      create(app, { slug: '3d-models', name: { en: 'Again', id: 'Lagi' } }),
    ).rejects.toSatisfy(status(409, 'category.in_use'));
    expect(await list(app)).toHaveLength(3);
    expect(await newAudits(app)).toEqual([]);
  });

  it('avoids a record id collision when a renamed category held the slug-based id', async () => {
    const app = await assetsApp();
    await update(app, 'cat-empty', { slug: 'renamed-empty' });
    const res = await create(app, {
      slug: 'empty',
      name: { en: 'Empty Again', id: 'Kosong Lagi' },
    });
    expect(res.id).not.toBe('cat-empty');
    expect(await list(app)).toHaveLength(4);
  });

  it('validates the body', async () => {
    const app = await assetsApp();
    for (const body of [
      {},
      { slug: 'Bad Slug', name: { en: 'x', id: 'x' } },
      { slug: 'ok', name: 'nope' },
      { slug: 'ok', name: { en: '', id: 'x' } },
      { slug: 'ok', name: { en: 'x', id: 5 } },
      { slug: 'ok', name: { en: 'x', id: 'x' }, sortOrder: -1 },
      { slug: 'ok', name: { en: 'x', id: 'x' }, isActive: 'yes' },
      { slug: 'x'.repeat(81), name: { en: 'x', id: 'x' } },
    ]) {
      await expect(create(app, body), JSON.stringify(body)).rejects.toSatisfy(status(400));
    }
    expect(await list(app)).toHaveLength(3);
  });

  it('shows up on /categories and the id name falls back to the English one when blank', async () => {
    const app = await assetsApp();
    await create(app, { slug: 'audio-fx', name: { en: 'Audio FX', id: '' } });
    const pubRows = await pub(app, 'id');
    expect(pubRows.at(-1)).toMatchObject({
      id: 'cat-audio-fx',
      slug: 'audio-fx',
      name: 'Audio FX',
      assetCount: 0,
    });
    expect(pubRows).toHaveLength(4);
  });
});

describe('PATCH /admin/categories/{id}', () => {
  it('renames in either language and keeps the other', async () => {
    const app = await assetsApp();
    const res = await update(app, 'cat-2d-art', { name: { en: '2D Artwork' } });
    expect(res.name).toEqual({ en: '2D Artwork', id: 'Seni 2D & Sprite' });
    await update(app, 'cat-2d-art', { name: { id: 'Seni Dua Dimensi' } });
    expect((await stored(app, 'cat-2d-art')).name).toEqual({
      en: '2D Artwork',
      id: 'Seni Dua Dimensi',
    });
    expect(res.updatedAt).toBe('2026-06-10T12:00:00.000Z');
    expect(res.createdAt).toBe('2025-01-15T00:00:00.000Z');
    const rows = await newAudits(app);
    expect(rows.map((r) => [r.action, r.subjectId, r.metadata])).toEqual([
      ['category.update', 'cat-2d-art', { fields: ['name'] }],
      ['category.update', 'cat-2d-art', { fields: ['name'] }],
    ]);
  });

  it('applies what the edit modal sends and audits only what changed', async () => {
    const app = await assetsApp();
    const res = await update(app, 'cat-2d-art', {
      slug: '2d-art',
      name: { en: '2D Art & Sprites', id: 'Seni 2D & Sprite' },
      isActive: false,
    });
    expect(res.isActive).toBe(false);
    expect((await newAudits(app))[0]!.metadata).toEqual({ fields: ['isActive'] });
  });

  it('changes slug, icon and sort order, and refuses a slug that belongs to another category', async () => {
    const app = await assetsApp();
    const res = await update(app, 'cat-empty', { slug: 'unused', iconKey: 'star', sortOrder: 5 });
    expect(res).toMatchObject({ slug: 'unused', iconKey: 'star', sortOrder: 5 });
    await expect(update(app, 'cat-empty', { slug: '2d-art' })).rejects.toSatisfy(
      status(409, 'category.in_use'),
    );
    expect((await stored(app, 'cat-empty')).slug).toBe('unused');
    // a null icon clears it (the real API can only replace it)
    expect((await update(app, 'cat-empty', { iconKey: null })).iconKey).toBeNull();
  });

  it('a patch that changes nothing writes and audits nothing', async () => {
    const app = await assetsApp();
    const res = await update(app, 'cat-2d-art', {
      name: { en: '2D Art & Sprites' },
      isActive: true,
    });
    expect(res.updatedAt).toBe('2025-01-15T00:00:00.000Z');
    expect(await newAudits(app)).toEqual([]);
  });

  it('renames and deactivation reach /categories and /discover at once', async () => {
    const app = await assetsApp();
    await update(app, 'cat-2d-art', { name: { en: 'Pixel World', id: 'Dunia Piksel' } });
    expect((await pub(app)).find((c) => c.id === 'cat-2d-art')!.name).toBe('Pixel World');
    expect((await pub(app, 'id')).find((c) => c.id === 'cat-2d-art')!.name).toBe('Dunia Piksel');
    expect((await discover(app)).rows.find((r) => r.categoryId === 'cat-2d-art')!.name).toBe(
      'Pixel World',
    );
    await update(app, 'cat-2d-art', { isActive: false });
    expect(ids(await pub(app))).toEqual(['cat-3d-models', 'cat-empty']);
    expect((await discover(app)).rows.map((r) => r.categoryId)).toEqual(['cat-3d-models']);
    // assets keep their category name (the asset page reads it through the id)
    const detail = await app.call<{ category: { name: string } }>('GET', '/assets/fx-002');
    expect(detail.category.name).toBe('Pixel World');
  });

  it('validates and 404s on an unknown id', async () => {
    const app = await assetsApp();
    for (const body of [
      { slug: 'Not Valid' },
      { name: 'x' },
      { name: { en: '' } },
      { sortOrder: -3 },
      { isActive: 1 },
      { iconKey: 5 },
    ]) {
      await expect(update(app, 'cat-2d-art', body), JSON.stringify(body)).rejects.toSatisfy(
        status(400),
      );
    }
    await expect(update(app, 'cat-nope', { isActive: false })).rejects.toSatisfy(
      status(404, 'category.not_found'),
    );
  });
});

describe('DELETE /admin/categories/{id}', () => {
  it('removes an empty category and audits it', async () => {
    const app = await assetsApp();
    expect(await remove(app, 'cat-empty')).toBeUndefined();
    expect(ids(await list(app))).toEqual(['cat-3d-models', 'cat-2d-art']);
    expect(ids(await pub(app))).toEqual(['cat-3d-models', 'cat-2d-art']);
    const rows = await newAudits(app);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: 'category.delete',
      subjectType: 'Category',
      subjectId: 'cat-empty',
      metadata: { slug: 'empty' },
    });
  });

  it('is refused with 409 category.in_use while any asset still uses it', async () => {
    const app = await assetsApp();
    const err = (await remove(app, 'cat-2d-art').catch((e) => e)) as Error;
    expect(status(409, 'category.in_use')(err)).toBe(true);
    expect(err.message).toMatch(/1 asset/);
    expect(await app.db.get('categories', 'cat-2d-art')).toBeDefined();
    expect(await newAudits(app)).toEqual([]);
  });

  it('also counts soft-deleted assets (restoring one must not leave a dangling category)', async () => {
    const app = await assetsApp();
    await app.db.patch<AssetRecord>('assets', 'a-gone', { categoryId: 'cat-empty' });
    expect((await list(app)).find((c) => c.id === 'cat-empty')!.assetCount).toBe(0);
    await expect(remove(app, 'cat-empty')).rejects.toSatisfy(status(409, 'category.in_use'));
  });

  it('works again after the assets are moved away', async () => {
    const app = await assetsApp();
    await app.db.patch<AssetRecord>('assets', 'a-fx-002', { categoryId: 'cat-3d-models' });
    await remove(app, 'cat-2d-art');
    expect(ids(await list(app))).toEqual(['cat-3d-models', 'cat-empty']);
  });

  it('is a 404 for an unknown category', async () => {
    const app = await assetsApp();
    await expect(remove(app, 'cat-nope')).rejects.toSatisfy(status(404, 'category.not_found'));
  });
});

describe('POST /admin/categories/reorder', () => {
  it('re-numbers 0..n-1 and the public list follows', async () => {
    const app = await assetsApp();
    await reorder(app, { orderedIds: ['cat-empty', 'cat-3d-models', 'cat-2d-art'] });
    expect(ids(await list(app))).toEqual(['cat-empty', 'cat-3d-models', 'cat-2d-art']);
    expect((await list(app)).map((c) => c.sortOrder)).toEqual([0, 1, 2]);
    expect(ids(await pub(app))).toEqual(['cat-empty', 'cat-3d-models', 'cat-2d-art']);
    expect((await discover(app)).rows.map((r) => r.categoryId)).toEqual([
      'cat-3d-models',
      'cat-2d-art',
    ]);
    const rows = await newAudits(app);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: 'category.reorder',
      subjectType: 'Category',
      subjectId: 'cat-empty',
      metadata: { order: ['cat-empty', 'cat-3d-models', 'cat-2d-art'] },
    });
  });

  it('lets the categories that are not listed follow', async () => {
    const app = await assetsApp();
    await reorder(app, { orderedIds: ['cat-2d-art'] });
    expect(ids(await list(app))).toEqual(['cat-2d-art', 'cat-3d-models', 'cat-empty']);
  });

  it('validates the list and writes nothing when it is wrong', async () => {
    const app = await assetsApp();
    for (const body of [{}, { orderedIds: [] }, { orderedIds: ['cat-empty', 'cat-empty'] }]) {
      await expect(reorder(app, body)).rejects.toSatisfy(status(400));
    }
    await expect(reorder(app, { orderedIds: ['cat-empty', 'cat-nope'] })).rejects.toSatisfy(
      status(404, 'category.not_found'),
    );
    expect(ids(await list(app))).toEqual(['cat-3d-models', 'cat-2d-art', 'cat-empty']);
    expect(await newAudits(app)).toEqual([]);
  });
});

describe('POST /admin/categories/icon-uploads/initiate', () => {
  const initiate = (app: App, body: unknown) =>
    app.call<{ putUrl: string; key: string; expiresAt: string }>(
      'POST',
      '/admin/categories/icon-uploads/initiate',
      { body },
    );

  it('hands out a preview:// PUT url and an icon key', async () => {
    const app = await assetsApp();
    const res = await initiate(app, { contentType: 'image/svg+xml', bytes: 2048 });
    expect(res.putUrl).toMatch(/^preview:\/\/up_/);
    expect(res.key).toBe(`category-icons/${res.putUrl.slice('preview://'.length)}`);
    expect(res.expiresAt).toBe('2026-06-10T13:00:00.000Z');
  });

  it('allows icons up to 256 KB only, and images only', async () => {
    const app = await assetsApp();
    expect(await initiate(app, { contentType: 'image/png', bytes: 256 * 1024 })).toBeDefined();
    await expect(
      initiate(app, { contentType: 'image/png', bytes: 256 * 1024 + 1 }),
    ).rejects.toSatisfy(status(400, 'file.upload_init_failed'));
    await expect(initiate(app, { contentType: 'text/plain', bytes: 10 })).rejects.toSatisfy(
      status(400),
    );
    await expect(initiate(app, { contentType: 'image/png' })).rejects.toSatisfy(status(400));
    await expect(initiate(app, undefined)).rejects.toSatisfy(status(400));
  });
});

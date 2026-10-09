import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import { createSeededTestApp } from '@/preview/test-utils';
import type { AssetRecord } from '@/preview/records';
import type {
  AssetDetail,
  AssetListPage,
  Category,
  DiscoverResponse,
  MeResponse,
  Tag,
} from '@/lib/api/types';
import { status } from './publish-fixtures';

const PERSONA = 'u-persona';

async function persona(app: Awaited<ReturnType<typeof createSeededTestApp>>) {
  const all = await app.db.list<AssetRecord>('assets');
  return all.filter((a) => a.ownerId === PERSONA);
}

describe('write handlers over the real seed', () => {
  it('creates a draft whose slug collides with a seeded listing', async () => {
    const app = await createSeededTestApp();
    const seeded = (await persona(app))[0]!;
    const res = await app.call<{ id: string; slug: string }>('POST', '/assets', {
      body: {
        title: seeded.title,
        engine: 'UNITY',
        categoryId: seeded.categoryId,
        licenseId: seeded.licenseId,
        semver: '0.1.0',
        translations: [
          { locale: 'en', shortDescription: '', longDescription: { type: 'doc', content: [] } },
        ],
      },
    });
    expect(res.slug).toBe(`${seeded.slug}-2`);
    const mine = await app.call<AssetListPage>('GET', '/assets', {
      query: { ownerId: PERSONA, includeUnpublished: 'true', limit: 100 },
    });
    expect(mine.items.find((a) => a.id === res.id)?.status).toBe('DRAFT');
  });

  it('patches a seeded persona draft (title, tags, description) and keeps it a draft', async () => {
    const app = await createSeededTestApp();
    const id = 'a-kaykit-character-animations';
    expect(await app.call<Tag[]>('GET', '/tags', { query: { q: 'a-brand' } })).toEqual([]);
    await app.call('PATCH', `/assets/${id}`, {
      body: {
        title: 'KayKit Animations (edited)',
        tags: ['animation', 'a-brand-new-tag'],
        translations: [
          {
            locale: 'en',
            shortDescription: 'Edited short',
            longDescription: { type: 'doc', content: [] },
          },
          { locale: 'id', shortDescription: '', longDescription: { type: 'doc', content: [] } },
        ],
      },
    });
    const d = await app.call<AssetDetail>('GET', `/assets/${id}`);
    expect(d).toMatchObject({
      status: 'DRAFT',
      title: 'KayKit Animations (edited)',
      shortDescription: 'Edited short',
    });
    expect(d.tags.map((t) => t.slug)).toContain('a-brand-new-tag');
    // Indonesian text of the seed survives the wizard's empty `id` translation.
    const idLocale = await app.call<AssetDetail>('GET', `/assets/${id}`, { locale: 'id' });
    expect(idLocale.shortDescription).not.toBe('Edited short');
    expect(idLocale.shortDescription.length).toBeGreaterThan(0);
    const created = await app.call<Tag[]>('GET', '/tags', { query: { q: 'a-brand' } });
    expect(created).toEqual([expect.objectContaining({ slug: 'a-brand-new-tag', usageCount: 1 })]);
  });

  it('a seeded draft with complete data publishes; one without compatibility is blocked with the exact field', async () => {
    const app = await createSeededTestApp();
    // Blender draft: five compatibility rows, a file, READY, thumbnail.
    expect(await app.call('POST', '/assets/a-window-glass-shader/publish', { body: {} })).toEqual({
      warnings: [],
    });
    const published = await app.call<AssetDetail>('GET', '/assets/a-window-glass-shader');
    expect(published.status).toBe('PUBLISHED');
    expect(published.versions[0]).toMatchObject({ isLatest: true });
    expect(published.versions[0]!.publishedAt).not.toBeNull();

    // STANDALONE_3D draft without compatibility rows: the wizard's checklist blocks it too.
    const err = (await app
      .call('POST', '/assets/a-kaykit-character-animations/publish', { body: {} })
      .catch((e) => e)) as ApiError;
    expect(err.status).toBe(400);
    expect(err.code).toBe('asset.publish_blocked');
    expect(err.fields).toEqual([
      expect.objectContaining({ path: 'version.compatibility', code: 'compatibility.missing' }),
    ]);
  });

  it('archive/restore of every persona asset updates /auth/me and category counts; delete removes it', async () => {
    const app = await createSeededTestApp();
    const mine = (await persona(app)).filter((a) => a.status === 'PUBLISHED');
    expect(mine.length).toBe(15);
    const counts = async () =>
      Object.fromEntries(
        (await app.call<Category[]>('GET', '/categories')).map((c) => [c.id, c.assetCount]),
      );
    const before = await counts();
    expect((await app.call<MeResponse>('GET', '/auth/me')).hasPublishedAssets).toBe(true);

    for (const a of mine) await app.call('POST', `/assets/${a.id}/archive`);
    const during = await counts();
    for (const a of mine) expect(during[a.categoryId]).toBeLessThan(before[a.categoryId]!);
    expect((await app.call<MeResponse>('GET', '/auth/me')).hasPublishedAssets).toBe(false);
    const archived = await app.call<AssetListPage>('GET', '/assets', {
      query: { ownerId: PERSONA, status: 'ARCHIVED', limit: 100 },
    });
    expect(archived.items.length).toBe(16); // the seeded archived one + 15

    const [first, ...rest] = mine;
    await app.call('POST', `/assets/${first!.id}/restore`);
    expect((await app.call<MeResponse>('GET', '/auth/me')).hasPublishedAssets).toBe(true);
    for (const a of rest) await app.call('POST', `/assets/${a.id}/restore`);
    expect(await counts()).toEqual(before);

    await app.call('DELETE', `/assets/${first!.id}`);
    await expect(app.call('GET', `/assets/${first!.id}`)).rejects.toSatisfy(
      status(404, 'asset.not_found'),
    );
    const discover = await app.call<DiscoverResponse>('GET', '/discover');
    expect(JSON.stringify(discover)).not.toContain(`"${first!.id}"`);
  });

  it('persists a title edit of a seeded published asset and bumps updatedAt', async () => {
    const app = await createSeededTestApp();
    const id = 'a-ucupaint';
    const before = await app.call<AssetDetail>('GET', `/assets/${id}`);
    await app.call('PATCH', `/assets/${id}`, { body: { title: 'Ucupaint Pro' } });
    const after = await app.call<AssetDetail>('GET', `/assets/${id}`);
    expect(after.title).toBe('Ucupaint Pro');
    expect(after.slug).toBe(before.slug);
    expect(after.updatedAt > before.updatedAt).toBe(true);
    const list = await app.call<AssetListPage>('GET', '/assets', {
      query: { sort: 'recentlyUpdated', limit: 1 },
    });
    expect(list.items[0]!.id).toBe(id);
  });
});

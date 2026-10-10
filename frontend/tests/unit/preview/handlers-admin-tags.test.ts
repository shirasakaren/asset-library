import { describe, expect, it } from 'vitest';
import type { AdminTagPage } from '@/lib/api/admin-types';
import type { AssetDetail, Tag } from '@/lib/api/types';
import type { AssetRecord, TagRecord } from '@/preview/records';
import { assetsApp, newAudits, status } from './admin-fixtures';

type App = Awaited<ReturnType<typeof assetsApp>>;

const tag = (
  id: string,
  displayName: string,
  usageCount: number,
  createdAt: string,
): TagRecord => ({
  id,
  slug: id.replace(/^tag-/, ''),
  displayName,
  usageCount,
  createdAt,
});

/**
 * Tags a, b, c, t (target) and u (unused). Live assets: fx-001 [a, t], fx-002 [b], fx-003 [a, b],
 * a-mine [c], a-draft [t]; a-gone is DELETED and still carries [a]. Stored counters follow the
 * seed invariant: live assets using the tag.
 */
async function tagsApp() {
  const app = await assetsApp(
    {},
    {
      tags: [
        tag('tag-a', 'Alpha', 2, '2026-01-01T00:00:00.000Z'),
        tag('tag-b', 'beta', 2, '2026-01-02T00:00:00.000Z'),
        tag('tag-c', 'Gamma', 1, '2026-01-03T00:00:00.000Z'),
        tag('tag-t', 'Target', 2, '2026-01-04T00:00:00.000Z'),
        tag('tag-u', 'Unused', 0, '2026-01-05T00:00:00.000Z'),
      ],
    },
  );
  const set = (id: string, tagIds: string[]) => app.db.patch<AssetRecord>('assets', id, { tagIds });
  await set('a-fx-001', ['tag-a', 'tag-t']);
  await set('a-fx-002', ['tag-b']);
  await set('a-fx-003', ['tag-a', 'tag-b']);
  await set('a-mine', ['tag-c']);
  await set('a-arch', []);
  await set('a-draft', ['tag-t']);
  await set('a-gone', ['tag-a']);
  return app;
}

const list = (app: App, query: Record<string, unknown> = {}) =>
  app.call<AdminTagPage>('GET', '/admin/tags', { query });
const merge = (app: App, body: unknown) => app.call('POST', '/admin/tags/merge', { body });
const rename = (app: App, id: string, body: Record<string, unknown>) =>
  app.call<TagRecord>('PATCH', `/admin/tags/${id}`, { body });
const remove = (app: App, id: string) => app.call('DELETE', `/admin/tags/${id}`);
const stored = async (app: App, id: string) =>
  (await app.db.get<TagRecord>('tags', id)) as TagRecord;
const tagIdsOf = async (app: App, id: string) =>
  ((await app.db.get<AssetRecord>('assets', id)) as AssetRecord).tagIds;
const ids = (rows: Array<{ id: string }>) => rows.map((r) => r.id);

describe('GET /admin/tags', () => {
  it('lists tags by display name (any case) with the AdminTagRow shape', async () => {
    const app = await tagsApp();
    const page = await list(app);
    expect(ids(page.items)).toEqual(['tag-a', 'tag-b', 'tag-c', 'tag-t', 'tag-u']);
    expect(page.items[1]).toEqual({
      id: 'tag-b',
      slug: 'b',
      displayName: 'beta',
      usageCount: 2,
      createdAt: '2026-01-02T00:00:00.000Z',
    });
    expect(page.pageInfo).toEqual({ nextCursor: null, hasMore: false });
  });

  it('filters by q on slug or display name, case-insensitively', async () => {
    const app = await tagsApp();
    const found = async (q: Record<string, unknown>) => ids((await list(app, q)).items);
    expect(await found({ q: 'ALP' })).toEqual(['tag-a']);
    expect(await found({ q: 'ta' })).toEqual(['tag-b', 'tag-t']);
    expect(await found({ q: 'c' })).toEqual(['tag-c']);
    expect(await found({ q: 'zzz' })).toEqual([]);
    // the page sends nothing for an empty search
    expect(await found({ q: undefined, cursor: undefined, limit: 50 })).toHaveLength(5);
  });

  it('filters by usage and sorts by usage or newest on request', async () => {
    const app = await tagsApp();
    const found = async (q: Record<string, unknown>) => ids((await list(app, q)).items);
    expect(await found({ minUsage: 2 })).toEqual(['tag-a', 'tag-b', 'tag-t']);
    expect(await found({ maxUsage: 1 })).toEqual(['tag-c', 'tag-u']);
    expect(await found({ minUsage: 1, maxUsage: 1 })).toEqual(['tag-c']);
    expect(await found({ sort: 'usage' })).toEqual(['tag-a', 'tag-b', 'tag-t', 'tag-c', 'tag-u']);
    expect(await found({ sort: 'newest' })).toEqual(['tag-u', 'tag-t', 'tag-c', 'tag-b', 'tag-a']);
    await expect(list(app, { sort: 'sideways' })).rejects.toSatisfy(status(400));
    await expect(list(app, { minUsage: 'many' })).rejects.toSatisfy(status(400));
  });

  it('pages with a cursor, once each', async () => {
    const app = await tagsApp();
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < 5; i += 1) {
      const page = await list(app, { limit: 2, cursor });
      seen.push(...ids(page.items));
      if (!page.pageInfo.hasMore) break;
      cursor = page.pageInfo.nextCursor!;
    }
    expect(seen).toEqual(['tag-a', 'tag-b', 'tag-c', 'tag-t', 'tag-u']);
  });
});

describe('POST /admin/tags/merge', () => {
  const body = { fromTagIds: ['tag-a', 'tag-b'], intoTagId: 'tag-t' };

  it('repoints every asset to the target without duplicates, deleted assets included', async () => {
    const app = await tagsApp();
    const res = await merge(app, body);
    expect(res).toBeUndefined();
    expect(await tagIdsOf(app, 'a-fx-001')).toEqual(['tag-t']);
    expect(await tagIdsOf(app, 'a-fx-002')).toEqual(['tag-t']);
    expect(await tagIdsOf(app, 'a-fx-003')).toEqual(['tag-t']);
    expect(await tagIdsOf(app, 'a-gone')).toEqual(['tag-t']);
    // untouched assets keep their tags
    expect(await tagIdsOf(app, 'a-mine')).toEqual(['tag-c']);
    expect(await tagIdsOf(app, 'a-draft')).toEqual(['tag-t']);
  });

  it('keeps the position of the tag it replaces and skips ones already present', async () => {
    const app = await tagsApp();
    await app.db.patch<AssetRecord>('assets', 'a-fx-003', {
      tagIds: ['tag-c', 'tag-a', 'tag-u', 'tag-b'],
    });
    await merge(app, body);
    expect(await tagIdsOf(app, 'a-fx-003')).toEqual(['tag-c', 'tag-t', 'tag-u']);
  });

  it('adds only the live assets that gained the target to its usageCount, and deletes the sources', async () => {
    const app = await tagsApp();
    await merge(app, body);
    // fx-002 and fx-003 gained it; fx-001 already had it; a-gone is soft-deleted (not counted)
    expect((await stored(app, 'tag-t')).usageCount).toBe(4);
    expect(await app.db.get('tags', 'tag-a')).toBeUndefined();
    expect(await app.db.get('tags', 'tag-b')).toBeUndefined();
    // and the counter equals the live assets that really carry it
    const assets = await app.db.list<AssetRecord>('assets');
    expect(assets.filter((a) => a.status !== 'DELETED' && a.tagIds.includes('tag-t')).length).toBe(
      4,
    );
    expect((await stored(app, 'tag-c')).usageCount).toBe(1);
  });

  it('shows up on /tags, /search/tags and the asset detail', async () => {
    const app = await tagsApp();
    await merge(app, body);
    const tags = await app.call<Tag[]>('GET', '/tags');
    expect(ids(tags).sort()).toEqual(['tag-c', 'tag-t', 'tag-u']);
    expect(tags.find((t) => t.id === 'tag-t')!.usageCount).toBe(4);
    expect(await app.call<Tag[]>('GET', '/tags', { query: { q: 'alp' } })).toEqual([]);
    const search = await app.call<Tag[]>('GET', '/search/tags', { query: { q: 'tar' } });
    expect(ids(search)).toEqual(['tag-t']);
    const detail = await app.call<AssetDetail>('GET', '/assets/fx-003');
    expect(detail.tags).toEqual([{ id: 'tag-t', slug: 't', displayName: 'Target' }]);
    const filtered = await app.call<{ items: Array<{ id: string }> }>('GET', '/assets', {
      query: { tags: 't' },
    });
    expect(ids(filtered.items).sort()).toEqual(['a-fx-001', 'a-fx-002', 'a-fx-003']);
  });

  it('audits one tag.merge row on the target with the merged slugs', async () => {
    const app = await tagsApp();
    await merge(app, body);
    const rows = await newAudits(app);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: 'tag.merge',
      subjectType: 'Tag',
      subjectId: 'tag-t',
      actorId: 'u-persona',
      metadata: { merged: ['a', 'b'], into: 't' },
    });
  });

  it('merges a single source and ignores a repeated one', async () => {
    const app = await tagsApp();
    await merge(app, { fromTagIds: ['tag-c', 'tag-c'], intoTagId: 'tag-t' });
    expect(await tagIdsOf(app, 'a-mine')).toEqual(['tag-t']);
    expect((await stored(app, 'tag-t')).usageCount).toBe(3);
    expect((await newAudits(app))[0]!.metadata).toEqual({ merged: ['c'], into: 't' });
  });

  it('refuses a merge into itself, unknown tags and malformed bodies, writing nothing', async () => {
    const app = await tagsApp();
    await expect(
      merge(app, { fromTagIds: ['tag-t', 'tag-a'], intoTagId: 'tag-t' }),
    ).rejects.toSatisfy(status(400, 'tag.merge_into_self'));
    await expect(merge(app, { fromTagIds: ['tag-a'], intoTagId: 'tag-nope' })).rejects.toSatisfy(
      status(404, 'tag.not_found'),
    );
    await expect(
      merge(app, { fromTagIds: ['tag-a', 'tag-nope'], intoTagId: 'tag-t' }),
    ).rejects.toSatisfy(status(404, 'tag.not_found'));
    for (const bad of [
      undefined,
      {},
      { fromTagIds: [], intoTagId: 'tag-t' },
      { fromTagIds: 'tag-a', intoTagId: 'tag-t' },
      { fromTagIds: [5], intoTagId: 'tag-t' },
      { fromTagIds: ['tag-a'] },
    ]) {
      await expect(merge(app, bad), JSON.stringify(bad)).rejects.toSatisfy(status(400));
    }
    expect(await tagIdsOf(app, 'a-fx-003')).toEqual(['tag-a', 'tag-b']);
    expect(await app.db.get('tags', 'tag-a')).toBeDefined();
    expect(await newAudits(app)).toEqual([]);
  });

  it('a restored asset counts its repointed tag again', async () => {
    const app = await tagsApp();
    await merge(app, body);
    await app.call('POST', '/admin/assets/a-gone/restore');
    // a-gone comes back (as a draft: it was never published) and carries the target
    expect((await stored(app, 'tag-t')).usageCount).toBe(5);
  });
});

describe('PATCH /admin/tags/{id}', () => {
  it('renames the display name and shows it everywhere', async () => {
    const app = await tagsApp();
    const res = await rename(app, 'tag-b', { slug: 'b', displayName: 'Beta' });
    expect(res).toEqual({
      id: 'tag-b',
      slug: 'b',
      displayName: 'Beta',
      usageCount: 2,
      createdAt: '2026-01-02T00:00:00.000Z',
    });
    const detail = await app.call<AssetDetail>('GET', '/assets/fx-002');
    expect(detail.tags[0]!.displayName).toBe('Beta');
    expect((await app.call<Tag[]>('GET', '/tags')).find((t) => t.id === 'tag-b')!.displayName).toBe(
      'Beta',
    );
    const rows = await newAudits(app);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: 'tag.update',
      subjectType: 'Tag',
      subjectId: 'tag-b',
      metadata: { before: 'beta', after: 'Beta' },
    });
  });

  it('changes the slug and refuses one that another tag has (409 tag.in_use)', async () => {
    const app = await tagsApp();
    const res = await rename(app, 'tag-c', { slug: 'gamma-ray', displayName: 'Gamma' });
    expect(res.slug).toBe('gamma-ray');
    expect((await newAudits(app))[0]!.metadata).toEqual({
      slugBefore: 'c',
      slugAfter: 'gamma-ray',
    });
    await expect(rename(app, 'tag-c', { slug: 't', displayName: 'Gamma' })).rejects.toSatisfy(
      status(409, 'tag.in_use'),
    );
    expect((await stored(app, 'tag-c')).slug).toBe('gamma-ray');
    // the old slug is free again
    expect((await rename(app, 'tag-u', { slug: 'c' })).slug).toBe('c');
  });

  it('accepts the unchanged slug of a legacy tag the slug rule would not allow', async () => {
    const app = await tagsApp();
    await app.db.put('tags', tag('tag-legacy', 'C++', 0, '2026-01-06T00:00:00.000Z'));
    await app.db.patch<TagRecord>('tags', 'tag-legacy', { slug: 'c++' });
    const res = await rename(app, 'tag-legacy', { slug: 'c++', displayName: 'C Plus Plus' });
    expect(res).toMatchObject({ slug: 'c++', displayName: 'C Plus Plus' });
    await expect(rename(app, 'tag-legacy', { slug: 'C Sharp' })).rejects.toSatisfy(status(400));
  });

  it('a rename that changes nothing writes and audits nothing', async () => {
    const app = await tagsApp();
    await rename(app, 'tag-b', { slug: 'b', displayName: 'beta' });
    expect(await newAudits(app)).toEqual([]);
  });

  it('validates and 404s on an unknown tag', async () => {
    const app = await tagsApp();
    for (const bad of [
      { displayName: '' },
      { displayName: '   ' },
      { displayName: 'x'.repeat(81) },
      { displayName: 5 },
      { slug: 'Not Valid' },
      { slug: 'x'.repeat(81) },
    ]) {
      await expect(rename(app, 'tag-b', bad), JSON.stringify(bad)).rejects.toSatisfy(status(400));
    }
    await expect(rename(app, 'tag-nope', { displayName: 'X' })).rejects.toSatisfy(
      status(404, 'tag.not_found'),
    );
  });
});

describe('DELETE /admin/tags/{id}', () => {
  it('removes an unused tag and audits it', async () => {
    const app = await tagsApp();
    expect(await remove(app, 'tag-u')).toBeUndefined();
    expect(await app.db.get('tags', 'tag-u')).toBeUndefined();
    expect(ids((await list(app)).items)).not.toContain('tag-u');
    const rows = await newAudits(app);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: 'tag.delete',
      subjectType: 'Tag',
      subjectId: 'tag-u',
      metadata: { slug: 'u' },
    });
  });

  it('is refused with 409 tag.in_use while any asset carries it, soft-deleted ones included', async () => {
    const app = await tagsApp();
    const err = (await remove(app, 'tag-c').catch((e) => e)) as Error;
    expect(status(409, 'tag.in_use')(err)).toBe(true);
    expect(err.message).toMatch(/1 asset/);
    await app.db.patch<AssetRecord>('assets', 'a-mine', { tagIds: [] });
    await app.db.patch<AssetRecord>('assets', 'a-gone', { tagIds: ['tag-c'] });
    await expect(remove(app, 'tag-c')).rejects.toSatisfy(status(409, 'tag.in_use'));
    expect(await app.db.get('tags', 'tag-c')).toBeDefined();
    expect(await newAudits(app)).toEqual([]);
    await app.db.patch<AssetRecord>('assets', 'a-gone', { tagIds: [] });
    await remove(app, 'tag-c');
    expect(await app.db.get('tags', 'tag-c')).toBeUndefined();
  });

  it('is a 404 for an unknown tag', async () => {
    const app = await tagsApp();
    await expect(remove(app, 'tag-nope')).rejects.toSatisfy(status(404, 'tag.not_found'));
  });
});

import { describe, it, expect } from 'vitest';
import type { AdminAssetListPage, AdminAssetRow } from '@/lib/api/admin-types';
import type { AssetDetail } from '@/lib/api/types';
import type { AssetRecord, AuditRecord, TagRecord } from '@/preview/records';
import { recordEvents } from './publish-fixtures';
import { assetsApp, FX_OTHER, FX_PERSONA, status } from './admin-fixtures';

type App = Awaited<ReturnType<typeof assetsApp>>;
const list = (app: App, query: Record<string, unknown> = {}) =>
  app.call<AdminAssetListPage>('GET', '/admin/assets', { query });
const ids = (p: { items: Array<{ id: string }> }) => p.items.map((x) => x.id);
const audits = async (app: App) =>
  (await app.db.list<AuditRecord>('audit')).filter((r) => !r.id.startsWith('au-0'));
const stored = async (app: App, id: string) =>
  (await app.db.get<AssetRecord>('assets', id)) as AssetRecord;
const tagUsage = async (app: App, id: string) =>
  ((await app.db.get<TagRecord>('tags', id)) as TagRecord).usageCount;

describe('GET /admin/assets', () => {
  it('lists every live asset by recentlyUpdated, with global status counts', async () => {
    const app = await assetsApp();
    const page = await list(app);
    expect(ids(page)).toEqual(['a-mine', 'a-arch', 'a-draft', 'a-fx-003', 'a-fx-002', 'a-fx-001']);
    expect(page.counts).toEqual({ DRAFT: 1, PUBLISHED: 4, ARCHIVED: 1, DELETED: 1 });
    expect(page.pageInfo).toEqual({ nextCursor: null, hasMore: false });
  });

  it('maps rows to the admin shape (owner, email, category, sizes)', async () => {
    const app = await assetsApp();
    const row = (await list(app)).items.find((r) => r.id === 'a-mine') as AdminAssetRow;
    expect(row).toEqual({
      id: 'a-mine',
      slug: 'mine',
      title: 'My Own Asset',
      ownerId: FX_PERSONA,
      ownerDisplayName: 'Aria Wijaya',
      ownerEmail: 'aria@example.test',
      engine: 'UNITY',
      status: 'PUBLISHED',
      thumbnailUrl: '/thumbs/mine.webp',
      categoryName: '3D Models',
      totalDownloads: 9,
      totalSaves: 5,
      updatedAt: '2026-05-10T10:00:00.000Z',
      publishedAt: '2026-04-01T00:00:00.000Z',
    });
  });

  it('filters by status (DELETED rows only on request) and keeps counts global', async () => {
    const app = await assetsApp();
    const del = await list(app, { status: 'DELETED' });
    expect(ids(del)).toEqual(['a-gone']);
    expect(del.counts.PUBLISHED).toBe(4);
    expect(ids(await list(app, { status: 'DRAFT' }))).toEqual(['a-draft']);
    expect(ids(await list(app, { status: 'ARCHIVED,DRAFT' }))).toEqual(['a-arch', 'a-draft']);
    await expect(list(app, { status: 'NOPE' })).rejects.toSatisfy(status(400));
  });

  it('filters by owner, category and engine', async () => {
    const app = await assetsApp();
    expect(ids(await list(app, { ownerId: FX_PERSONA }))).toEqual(['a-mine']);
    expect(ids(await list(app, { ownerId: 'u-third' }))).toEqual(['a-draft']);
    expect(ids(await list(app, { categoryId: 'cat-2d-art' }))).toEqual(['a-fx-002']);
    expect(ids(await list(app, { categoryIds: 'cat-2d-art' }))).toEqual(['a-fx-002']);
    expect(ids(await list(app, { engine: 'UNREAL' }))).toEqual([]);
  });

  it('searches title, slug, owner name and owner email', async () => {
    const app = await assetsApp();
    expect(ids(await list(app, { q: 'draft zeta' }))).toEqual(['a-draft']);
    expect(ids(await list(app, { q: 'fx-002' }))).toEqual(['a-fx-002']);
    expect(ids(await list(app, { q: 'Aria' }))).toEqual(['a-mine']);
    expect(ids(await list(app, { q: 'siti@example' }))).toEqual(['a-draft']);
    expect(ids(await list(app, { q: 'zzzz-nothing' }))).toEqual([]);
  });

  it('sorts like the page offers it and rejects unknown sorts', async () => {
    const app = await assetsApp();
    expect(ids(await list(app, { sort: 'alphabetical' }))[0]).toBe('a-arch');
    expect(ids(await list(app, { sort: 'mostDownloaded' }))[0]).toBe('a-mine');
    expect(ids(await list(app, { sort: 'newest' }))[0]).toBe('a-arch');
    expect(ids(await list(app, { sort: 'mostSaved' }))[0]).toBe('a-mine');
    await expect(list(app, { sort: 'bogus' })).rejects.toSatisfy(status(400));
  });

  it('pages with a cursor without repeating or skipping rows', async () => {
    const app = await assetsApp();
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < 10; i += 1) {
      const page = await list(app, { limit: 2, cursor });
      seen.push(...ids(page));
      if (!page.pageInfo.hasMore) break;
      cursor = page.pageInfo.nextCursor!;
    }
    expect(seen).toEqual(ids(await list(app)));
    expect(new Set(seen).size).toBe(6);
  });

  it('is admin-only', async () => {
    const app = await assetsApp({ meId: FX_OTHER });
    await expect(list(app)).rejects.toSatisfy(status(403));
  });
});

describe('GET /admin/assets/{id}', () => {
  it('returns the full detail of any status, by id or slug', async () => {
    const app = await assetsApp();
    const d = await app.call<AssetDetail>('GET', '/admin/assets/a-draft');
    expect(d).toMatchObject({ id: 'a-draft', status: 'DRAFT', canEdit: true });
    expect((await app.call<AssetDetail>('GET', '/admin/assets/a-gone')).status).toBe('DELETED');
    expect((await app.call<AssetDetail>('GET', '/admin/assets/mine')).id).toBe('a-mine');
    await expect(app.call('GET', '/admin/assets/a-nope')).rejects.toSatisfy(
      status(404, 'asset.not_found'),
    );
  });
});

describe('PATCH /admin/assets/{id}', () => {
  it('edits another owner asset, audits asset.admin_edit with the fields and reason', async () => {
    const app = await assetsApp();
    const events = recordEvents();
    await app.call('PATCH', '/admin/assets/a-fx-001', {
      body: { title: 'Renamed By Admin', reason: 'Policy review' },
    });
    events.stop();
    const a = await stored(app, 'a-fx-001');
    expect(a.title).toBe('Renamed By Admin');
    expect(a.titleI18n).toEqual({ en: 'Renamed By Admin', id: 'Renamed By Admin' });
    expect(a.updatedAt).not.toBe('2026-01-02T00:00:00.000Z');
    expect(events.events.some((e) => e.type === 'assets.changed')).toBe(true);
    const rows = await audits(app);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: 'asset.admin_edit',
      subjectType: 'Asset',
      subjectId: 'a-fx-001',
      actorId: FX_PERSONA,
      metadata: { fields: ['title'], reason: 'Policy review' },
    });
  });

  it('reuses the owner validation: same 400 and fields, nothing written, nothing audited', async () => {
    const app = await assetsApp();
    const failure = (p: Promise<unknown>) =>
      p.then(
        () => {
          throw new Error('expected the request to fail');
        },
        (e: { status: number; fields?: unknown }) => e,
      );
    const owner = await failure(app.call('PATCH', '/assets/a-fx-001', { body: { title: 'ab' } }));
    const admin = await failure(
      app.call('PATCH', '/admin/assets/a-fx-001', { body: { title: 'ab' } }),
    );
    expect(admin.status).toBe(400);
    expect(admin.fields).toEqual(owner.fields);
    expect((await stored(app, 'a-fx-001')).title).toBe('Fixture Item 001');
    expect(await audits(app)).toHaveLength(0);
  });

  it('keeps the locks (slug of a published asset) and the other owner rules', async () => {
    const app = await assetsApp();
    await expect(
      app.call('PATCH', '/admin/assets/a-fx-001', { body: { slug: 'new-slug' } }),
    ).rejects.toSatisfy(status(400, 'asset.publish_blocked'));
    await expect(
      app.call('PATCH', '/admin/assets/a-fx-001', { body: { categoryId: 'cat-none' } }),
    ).rejects.toSatisfy(status(404, 'category.not_found'));
  });

  it('adjusts tag usage like the owner path and audits tags', async () => {
    const app = await assetsApp();
    await app.call('PATCH', '/admin/assets/a-fx-001', { body: { tags: ['lava'] } });
    expect(await tagUsage(app, 'tag-lava')).toBe(3);
    expect((await audits(app))[0]!.metadata).toEqual({ fields: ['tags'] });
  });

  it('an empty patch writes and audits nothing; a bad reason or unknown asset fails', async () => {
    const app = await assetsApp();
    await app.call('PATCH', '/admin/assets/a-fx-001', { body: { title: 'Fixture Item 001' } });
    expect(await audits(app)).toHaveLength(0);
    await expect(
      app.call('PATCH', '/admin/assets/a-fx-001', { body: { title: 'Okay title', reason: 'x' } }),
    ).rejects.toSatisfy(status(400));
    await expect(
      app.call('PATCH', '/admin/assets/a-nope', { body: { title: 'Okay title' } }),
    ).rejects.toSatisfy(status(404, 'asset.not_found'));
    await expect(
      app.call('PATCH', '/admin/assets/a-gone', { body: { title: 'Okay title' } }),
    ).rejects.toSatisfy(status(404, 'asset.not_found'));
  });
});

describe('admin archive, restore and delete', () => {
  it('archive needs a reason, only works on PUBLISHED, and audits asset.admin_archive', async () => {
    const app = await assetsApp();
    await expect(
      app.call('POST', '/admin/assets/a-fx-001/archive', { body: {} }),
    ).rejects.toSatisfy(status(400));
    await expect(
      app.call('POST', '/admin/assets/a-draft/archive', { body: { reason: 'because' } }),
    ).rejects.toSatisfy(status(400, 'asset.archive_blocked'));
    await app.call('POST', '/admin/assets/a-fx-001/archive', { body: { reason: 'Outdated text' } });
    expect((await stored(app, 'a-fx-001')).status).toBe('ARCHIVED');
    expect((await audits(app))[0]).toMatchObject({
      action: 'asset.admin_archive',
      subjectId: 'a-fx-001',
      metadata: { previousStatus: 'PUBLISHED', reason: 'Outdated text' },
    });
  });

  it('restore brings ARCHIVED back to PUBLISHED and audits; a published asset is a 400', async () => {
    const app = await assetsApp();
    await app.call('POST', '/admin/assets/a-arch/restore');
    expect((await stored(app, 'a-arch')).status).toBe('PUBLISHED');
    expect((await audits(app))[0]).toMatchObject({
      action: 'asset.admin_restore',
      metadata: { previousStatus: 'ARCHIVED' },
    });
    await expect(app.call('POST', '/admin/assets/a-arch/restore')).rejects.toSatisfy(
      status(400, 'asset.archive_blocked'),
    );
  });

  it('restores a soft-deleted asset (back to DRAFT when it was never published) and re-counts tags', async () => {
    const app = await assetsApp();
    await app.call('POST', '/admin/assets/a-gone/restore');
    const a = await stored(app, 'a-gone');
    expect(a.status).toBe('DRAFT');
    expect(await tagUsage(app, 'tag-lava')).toBe(3);
  });

  it('soft delete needs a reason, hides the asset, releases tags and audits asset.admin_delete', async () => {
    const app = await assetsApp();
    await expect(app.call('DELETE', '/admin/assets/a-mine', { body: {} })).rejects.toSatisfy(
      status(400),
    );
    await app.call('DELETE', '/admin/assets/a-mine', { body: { reason: 'Takedown request' } });
    expect((await stored(app, 'a-mine')).status).toBe('DELETED');
    expect(await tagUsage(app, 'tag-lava')).toBe(1);
    await expect(app.call('GET', '/assets/a-mine')).rejects.toSatisfy(status(404));
    expect((await audits(app))[0]).toMatchObject({
      action: 'asset.admin_delete',
      metadata: { previousStatus: 'PUBLISHED', reason: 'Takedown request' },
    });
    await expect(
      app.call('DELETE', '/admin/assets/a-mine', { body: { reason: 'Takedown request' } }),
    ).rejects.toSatisfy(status(404, 'asset.not_found'));
  });

  it('never stores derived fields', async () => {
    const app = await assetsApp();
    const before = Object.keys(await stored(app, 'a-fx-001')).sort();
    await app.call('PATCH', '/admin/assets/a-fx-001', { body: { title: 'Another Name' } });
    await app.call('POST', '/admin/assets/a-fx-001/archive', { body: { reason: 'tidy up' } });
    expect(Object.keys(await stored(app, 'a-fx-001')).sort()).toEqual(before);
  });
});

describe('admin actions through the user routes (what the admin screens call)', () => {
  it('archive / restore / delete of ANOTHER owner asset by the admin are audited', async () => {
    const app = await assetsApp();
    await app.call('POST', '/assets/a-fx-001/archive');
    await app.call('POST', '/assets/a-fx-001/restore');
    await app.call('DELETE', '/assets/a-fx-001');
    const rows = (await audits(app)).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    expect(rows.map((r) => r.action).sort()).toEqual(
      ['asset.admin_archive', 'asset.admin_delete', 'asset.admin_restore'].sort(),
    );
    expect(rows.every((r) => r.subjectId === 'a-fx-001' && r.actorId === FX_PERSONA)).toBe(true);
  });

  it('the same actions on the admin own asset are not audited', async () => {
    const app = await assetsApp();
    await app.call('POST', '/assets/a-mine/archive');
    await app.call('POST', '/assets/a-mine/restore');
    expect(await audits(app)).toHaveLength(0);
  });

  it('wizard saves on another owner asset are audited as one coalesced asset.admin_edit row', async () => {
    const app = await assetsApp();
    await app.call('PATCH', '/assets/a-fx-001', { body: { title: 'First Edit' } });
    await app.call('PATCH', '/assets/a-fx-001', { body: { title: 'Second Edit', tags: ['lava'] } });
    const rows = await audits(app);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: 'asset.admin_edit', subjectId: 'a-fx-001' });
    expect((rows[0]!.metadata as { fields: string[] }).fields.sort()).toEqual(['tags', 'title']);
    // another asset starts a new row
    await app.call('PATCH', '/assets/a-fx-002', { body: { title: 'Other Asset' } });
    expect(await audits(app)).toHaveLength(2);
    // editing the admin own asset is not an admin action
    await app.call('PATCH', '/assets/a-mine', { body: { title: 'My Renamed' } });
    expect(await audits(app)).toHaveLength(2);
  });
});

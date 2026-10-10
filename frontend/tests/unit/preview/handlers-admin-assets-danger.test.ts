import { describe, it, expect } from 'vitest';
import type { MeResponse } from '@/lib/api/types';
import type {
  AnalyticsRecord,
  AssetRecord,
  FeaturedRecord,
  LibraryRecord,
  NotificationRecord,
  ReportRecord,
  StorageRecord,
  TagRecord,
  CommentRecord,
} from '@/preview/records';
import { cm } from './social-fixtures';
import { assetsApp, FX_OTHER, FX_PERSONA, status, newAudits } from './admin-fixtures';

type App = Awaited<ReturnType<typeof assetsApp>>;
const audits = (app: App) => newAudits(app);
const confirm = (over: Record<string, unknown> = {}) => ({
  confirm: 'I understand',
  confirmedAt: new Date('2026-06-10T11:59:30.000Z').toISOString(),
  ...over,
});
const forceDelete = (app: App, id: string, body: Record<string, unknown>) =>
  app.call('POST', `/admin/assets/${id}/force-delete`, { body });
const slot = (id: string, assetId: string, sortOrder: number): FeaturedRecord => ({
  id,
  assetId,
  customBannerKey: null,
  customBannerUrl: null,
  customTitle: null,
  customShortDescription: null,
  sortOrder,
  isActive: true,
  createdAt: '2026-05-01T00:00:00.000Z',
  updatedAt: '2026-05-01T00:00:00.000Z',
});

describe('POST /admin/assets/{id}/force-delete', () => {
  it('requires the confirmation phrase and a fresh timestamp', async () => {
    const app = await assetsApp();
    const reason = 'Legal takedown';
    await expect(forceDelete(app, 'a-fx-001', { reason })).rejects.toSatisfy(
      status(400, 'confirmation.required'),
    );
    await expect(
      forceDelete(app, 'a-fx-001', {
        reason,
        confirm: 'yes please',
        confirmedAt: confirm().confirmedAt,
      }),
    ).rejects.toSatisfy(status(400, 'confirmation.required'));
    await expect(
      forceDelete(app, 'a-fx-001', { reason, confirm: 'I understand' }),
    ).rejects.toSatisfy(status(400, 'confirmation.required'));
    await expect(
      forceDelete(app, 'a-fx-001', { reason, confirm: 'I understand', confirmedAt: 'garbage' }),
    ).rejects.toSatisfy(status(400, 'confirmation.required'));
    await expect(
      forceDelete(app, 'a-fx-001', {
        reason,
        ...confirm({ confirmedAt: '2026-06-10T11:58:00.000Z' }),
      }),
    ).rejects.toSatisfy(status(400, 'confirmation.expired'));
    expect(await app.db.get('assets', 'a-fx-001')).toBeDefined();
    expect(await audits(app)).toHaveLength(0);
  });

  it('checks the confirmation before the asset exists, then the reason', async () => {
    const app = await assetsApp();
    await expect(forceDelete(app, 'a-nope', { reason: 'long enough' })).rejects.toSatisfy(
      status(400, 'confirmation.required'),
    );
    await expect(forceDelete(app, 'a-fx-001', confirm())).rejects.toSatisfy(status(400));
    await expect(forceDelete(app, 'a-fx-001', confirm({ reason: 'no' }))).rejects.toSatisfy(
      status(400),
    );
    await expect(forceDelete(app, 'a-nope', confirm({ reason: 'long enough' }))).rejects.toSatisfy(
      status(404, 'asset.not_found'),
    );
  });

  it('removes the asset and everything that hangs off it, and keeps the counts consistent', async () => {
    const app = await assetsApp(
      {},
      {
        comments: [
          cm({ id: 'c-1', assetId: 'a-mine' }),
          cm({ id: 'c-2', assetId: 'a-mine', parentId: 'c-1', depth: 1 }),
          cm({ id: 'c-3', assetId: 'a-fx-001' }),
        ],
        library: [
          { id: 'a-mine', addedAt: '2026-05-01T00:00:00.000Z', hidden: false } as LibraryRecord,
          { id: 'a-fx-001', addedAt: '2026-05-01T00:00:00.000Z', hidden: false } as LibraryRecord,
        ],
        featured: [slot('fs-1', 'a-mine', 1), slot('fs-2', 'a-fx-001', 2)],
        notifications: [
          {
            id: 'n-1',
            type: 'COMMENT_CREATED',
            payload: { assetId: 'a-mine' },
            readAt: null,
            createdAt: '2026-05-02T00:00:00.000Z',
          } as NotificationRecord,
        ],
        reports: [
          {
            id: 'r-1',
            category: 'BROKEN_ASSET',
            notes: 'broken',
            status: 'OPEN',
            assetId: 'a-mine',
            reporterId: FX_OTHER,
            adminNotes: null,
            action: null,
            resolvedById: null,
            createdAt: '2026-05-02T00:00:00.000Z',
            resolvedAt: null,
          } as ReportRecord,
        ],
      },
    );
    await app.db.put<AnalyticsRecord>('analytics', {
      id: 'an-a-mine',
      kind: 'asset',
      assetId: 'a-mine',
      endDate: '2026-05-31',
      downloads7d: 1,
      downloads30d: 1,
      detail: null,
    });
    await app.db.put<StorageRecord>('storage', {
      id: 'st-asset-a-mine',
      kind: 'asset',
      refId: 'a-mine',
      bytes: 10,
      spark: new Array<number>(30).fill(10),
      asOfDate: '2026-05-31',
    });

    // before: persona owns a published asset, category 3d-models lists it
    expect((await app.call<MeResponse>('GET', '/auth/me')).hasPublishedAssets).toBe(true);
    const cats = async () =>
      (await app.call<Array<{ id: string; assetCount: number }>>('GET', '/categories')).find(
        (c) => c.id === 'cat-3d-models',
      )!.assetCount;
    expect(await cats()).toBe(3);

    await forceDelete(app, 'a-mine', confirm({ reason: 'Legal takedown' }));

    expect(await app.db.get('assets', 'a-mine')).toBeUndefined();
    await expect(app.call('GET', '/assets/a-mine')).rejects.toSatisfy(status(404));
    await expect(app.call('GET', '/admin/assets/a-mine')).rejects.toSatisfy(status(404));
    const comments = await app.db.list<CommentRecord>('comments');
    expect(comments.map((c) => c.id)).toEqual(['c-3']);
    expect((await app.db.list<LibraryRecord>('library')).map((l) => l.id)).toEqual(['a-fx-001']);
    expect((await app.db.list<FeaturedRecord>('featured')).map((f) => f.id)).toEqual(['fs-2']);
    expect(await app.db.get('analytics', 'an-a-mine')).toBeUndefined();
    // the seeded rollup row stays (the dashboard bucket subtracts it); it is not listed anywhere
    expect(await app.db.get('storage', 'st-asset-a-mine')).toBeDefined();
    const listed = await app.call<Array<{ assetId: string }>>('GET', '/admin/storage/assets');
    expect(listed.some((r) => r.assetId === 'a-mine')).toBe(false);
    // tag usage released (tag-lava 2 -> 1), category and owner flags follow
    expect(((await app.db.get<TagRecord>('tags', 'tag-lava')) as TagRecord).usageCount).toBe(1);
    expect(await cats()).toBe(2);
    expect((await app.call<MeResponse>('GET', '/auth/me')).hasPublishedAssets).toBe(false);
    // inbox rows and reports are history: kept (the backend has no cascade for them either)
    expect(await app.db.get('notifications', 'n-1')).toBeDefined();
    expect(await app.db.get('reports', 'r-1')).toBeDefined();
    // the other asset is untouched
    expect(await app.db.get('assets', 'a-fx-001')).toBeDefined();
  });

  it('does not release tags a second time for an already soft-deleted asset', async () => {
    const app = await assetsApp();
    await forceDelete(app, 'a-gone', confirm({ reason: 'Purge now' }));
    expect(await app.db.get('assets', 'a-gone')).toBeUndefined();
    expect(((await app.db.get<TagRecord>('tags', 'tag-lava')) as TagRecord).usageCount).toBe(2);
  });

  it('audits asset.force_delete with reason, previous status and owner', async () => {
    const app = await assetsApp();
    await forceDelete(app, 'a-arch', confirm({ reason: 'Legal takedown' }));
    const rows = await audits(app);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: 'asset.force_delete',
      subjectType: 'Asset',
      subjectId: 'a-arch',
      actorId: FX_PERSONA,
      metadata: { reason: 'Legal takedown', previousStatus: 'ARCHIVED', ownerId: FX_OTHER },
    });
  });
});

describe('POST /admin/assets/{id}/transfer', () => {
  const transfer = (app: App, id: string, body: Record<string, unknown>) =>
    app.call('POST', `/admin/assets/${id}/transfer`, { body });

  it('moves the asset to the new owner and audits asset.transfer', async () => {
    const app = await assetsApp();
    await transfer(app, 'a-fx-001', { newOwnerId: 'u-third', reason: 'Owner left the team' });
    const a = (await app.db.get<AssetRecord>('assets', 'a-fx-001')) as AssetRecord;
    expect(a.ownerId).toBe('u-third');
    const detail = await app.call<{ owner: { id: string; displayName: string } }>(
      'GET',
      '/assets/a-fx-001',
    );
    expect(detail.owner).toMatchObject({ id: 'u-third', displayName: 'Siti Rahmawati' });
    expect((await audits(app))[0]).toMatchObject({
      action: 'asset.transfer',
      subjectType: 'Asset',
      subjectId: 'a-fx-001',
      actorId: FX_PERSONA,
      metadata: { fromOwnerId: FX_OTHER, toOwnerId: 'u-third', reason: 'Owner left the team' },
    });
  });

  it('works with the exact body the modal sends (it also carries the confirmation fields)', async () => {
    const app = await assetsApp();
    await transfer(app, 'a-fx-002', { newOwnerId: FX_PERSONA, ...confirm() });
    expect(((await app.db.get('assets', 'a-fx-002')) as AssetRecord).ownerId).toBe(FX_PERSONA);
    expect((await audits(app))[0]!.metadata).toEqual({
      fromOwnerId: FX_OTHER,
      toOwnerId: FX_PERSONA,
    });
  });

  it('updates the derived owner data: users profile counts and the persona flag', async () => {
    const app = await assetsApp();
    const count = async (id: string) =>
      (await app.call<{ publishedAssetCount: number }>('GET', `/users/${id}`)).publishedAssetCount;
    expect(await count(FX_OTHER)).toBe(3);
    expect(await count(FX_PERSONA)).toBe(1);
    await transfer(app, 'a-fx-001', { newOwnerId: FX_PERSONA });
    expect(await count(FX_OTHER)).toBe(2);
    expect(await count(FX_PERSONA)).toBe(2);
    // the persona's only asset goes away
    await transfer(app, 'a-mine', { newOwnerId: FX_OTHER });
    await transfer(app, 'a-fx-001', { newOwnerId: FX_OTHER });
    expect((await app.call<MeResponse>('GET', '/auth/me')).hasPublishedAssets).toBe(false);
  });

  it('validates the body and the target user and asset', async () => {
    const app = await assetsApp();
    await expect(transfer(app, 'a-fx-001', {})).rejects.toSatisfy(status(400));
    await expect(transfer(app, 'a-fx-001', { newOwnerId: 5 })).rejects.toSatisfy(status(400));
    await expect(transfer(app, 'a-fx-001', { newOwnerId: 'u-nobody' })).rejects.toSatisfy(
      status(404, 'user.not_found'),
    );
    await expect(transfer(app, 'a-nope', { newOwnerId: 'u-third' })).rejects.toSatisfy(
      status(404, 'asset.not_found'),
    );
    await expect(transfer(app, 'a-gone', { newOwnerId: 'u-third' })).rejects.toSatisfy(
      status(404, 'asset.not_found'),
    );
    expect(await audits(app)).toHaveLength(0);
  });
});

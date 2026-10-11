import { describe, it, expect } from 'vitest';
import type { AdminAssetRequestPage, DashboardResponse } from '@/lib/api/admin-types';
import type { AssetRequest, AssetRequestListPage } from '@/lib/api/types';
import type { NotificationRecord, RequestRecord } from '@/preview/records';
import { assetsApp, FX_OTHER, FX_PERSONA, newAudits, status } from './admin-fixtures';

type App = Awaited<ReturnType<typeof assetsApp>>;

const request = (id: string, over: Partial<RequestRecord> = {}): RequestRecord => ({
  id,
  requesterId: 'u-third',
  assetLink: 'https://store.example.test/pack',
  assetType: 'Unity 3D model',
  intendedUse: 'We need it for the next game jam.',
  price: 12.5,
  notes: null,
  status: 'SENT',
  adminComment: null,
  createdAt: '2026-06-01T10:00:00.000Z',
  updatedAt: '2026-06-01T10:00:00.000Z',
  reviewedById: null,
  ...over,
});

const requests = (): RequestRecord[] => [
  request('req-1'),
  request('req-2', {
    requesterId: FX_PERSONA,
    status: 'PENDING',
    adminComment: 'Waiting for pricing.',
    reviewedById: FX_OTHER,
    createdAt: '2026-06-02T10:00:00.000Z',
  }),
  request('req-3', {
    requesterId: FX_OTHER,
    status: 'APPROVED',
    adminComment: 'Go ahead.',
    reviewedById: FX_PERSONA,
    price: null,
    createdAt: '2026-06-03T10:00:00.000Z',
  }),
  request('req-4', {
    status: 'REJECTED',
    adminComment: 'Too expensive.',
    reviewedById: FX_PERSONA,
    createdAt: '2026-06-04T10:00:00.000Z',
  }),
  request('req-5', { status: 'IN_REVIEW', createdAt: '2026-06-05T10:00:00.000Z' }),
];

const reqApp = () => assetsApp({}, { requests: requests() });
const list = (app: App, query: Record<string, unknown> = {}) =>
  app.call<AdminAssetRequestPage>('GET', '/admin/asset-requests', { query });
const get = (app: App, id: string) => app.call<AssetRequest>('GET', `/admin/asset-requests/${id}`);
const patch = (app: App, id: string, body: Record<string, unknown>) =>
  app.call<AssetRequest>('PATCH', `/admin/asset-requests/${id}`, { body });
const stored = async (app: App, id: string) =>
  (await app.db.get<RequestRecord>('requests', id)) as RequestRecord;
const notifications = (app: App) => app.db.list<NotificationRecord>('notifications');

describe('GET /admin/asset-requests', () => {
  it('lists every requester newest first with the AssetRequest shape', async () => {
    const app = await reqApp();
    const page = await list(app);
    expect(page.items.map((r) => r.id)).toEqual(['req-5', 'req-4', 'req-3', 'req-2', 'req-1']);
    expect(page.pageInfo).toEqual({ nextCursor: null, hasMore: false });
    expect(page.items.find((r) => r.id === 'req-2')).toEqual({
      id: 'req-2',
      assetLink: 'https://store.example.test/pack',
      assetType: 'Unity 3D model',
      intendedUse: 'We need it for the next game jam.',
      price: 12.5,
      notes: null,
      status: 'PENDING',
      adminComment: 'Waiting for pricing.',
      createdAt: '2026-06-02T10:00:00.000Z',
      updatedAt: '2026-06-01T10:00:00.000Z',
      requester: { id: FX_PERSONA, displayName: 'Aria Wijaya' },
    });
    expect(page.items.find((r) => r.id === 'req-3')!.price).toBeNull();
  });

  it('filters by status and requester, rejects an unknown status', async () => {
    const app = await reqApp();
    const ids = async (q: Record<string, unknown>) => (await list(app, q)).items.map((r) => r.id);
    expect(await ids({ status: 'SENT' })).toEqual(['req-1']);
    expect(await ids({ status: 'IN_REVIEW' })).toEqual(['req-5']);
    expect(await ids({ status: 'APPROVED' })).toEqual(['req-3']);
    expect(await ids({ requesterId: FX_PERSONA })).toEqual(['req-2']);
    expect(await ids({ status: 'REJECTED', requesterId: 'u-third' })).toEqual(['req-4']);
    // the page sends nothing for "All"
    expect(await ids({ status: undefined, cursor: undefined, limit: 50 })).toHaveLength(5);
    await expect(list(app, { status: 'DONE' })).rejects.toSatisfy(status(400));
  });

  it('pages with a cursor, once each', async () => {
    const app = await reqApp();
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < 5; i += 1) {
      const page = await list(app, { limit: 2, cursor });
      seen.push(...page.items.map((r) => r.id));
      if (!page.pageInfo.hasMore) break;
      cursor = page.pageInfo.nextCursor!;
    }
    expect(seen).toEqual(['req-5', 'req-4', 'req-3', 'req-2', 'req-1']);
  });

  it('shows a placeholder for a requester that no longer exists', async () => {
    const app = await assetsApp({}, { requests: [request('req-9', { requesterId: 'u-ghost' })] });
    expect((await get(app, 'req-9')).requester).toEqual({
      id: 'u-ghost',
      displayName: '(unknown)',
    });
  });
});

describe('GET /admin/asset-requests/{id}', () => {
  it('returns the row of the list, including other people requests', async () => {
    const app = await reqApp();
    for (const row of (await list(app)).items) expect(await get(app, row.id)).toEqual(row);
  });

  it('is a 404 for an unknown id', async () => {
    const app = await reqApp();
    await expect(get(app, 'req-nope')).rejects.toSatisfy(status(404, 'request.not_found'));
  });
});

describe('PATCH /admin/asset-requests/{id}', () => {
  it('moves SENT to IN_REVIEW, stamps the reviewer and returns the updated request', async () => {
    const app = await reqApp();
    const res = await patch(app, 'req-1', { status: 'IN_REVIEW' });
    expect(res).toMatchObject({
      id: 'req-1',
      status: 'IN_REVIEW',
      adminComment: null,
      updatedAt: '2026-06-10T12:00:00.000Z',
      createdAt: '2026-06-01T10:00:00.000Z',
      requester: { id: 'u-third', displayName: 'Siti Rahmawati' },
    });
    expect(await stored(app, 'req-1')).toMatchObject({
      status: 'IN_REVIEW',
      reviewedById: FX_PERSONA,
      updatedAt: '2026-06-10T12:00:00.000Z',
    });
    expect(await get(app, 'req-1')).toEqual(res);
  });

  it('stores the comment and keeps the previous one when none is sent', async () => {
    const app = await reqApp();
    await patch(app, 'req-2', { status: 'APPROVED', adminComment: 'Approved, buy it.' });
    expect((await stored(app, 'req-2')).adminComment).toBe('Approved, buy it.');
    await patch(app, 'req-2', { status: 'PENDING' });
    expect((await stored(app, 'req-2')).adminComment).toBe('Approved, buy it.');
    // the form sends undefined for an empty comment, a blank one is the same
    await patch(app, 'req-2', { status: 'IN_REVIEW', adminComment: '   ' });
    expect((await stored(app, 'req-2')).adminComment).toBe('Approved, buy it.');
  });

  it('allows any transition between the four review statuses (the backend has no state machine)', async () => {
    const app = await reqApp();
    for (const to of ['APPROVED', 'PENDING', 'IN_REVIEW', 'REJECTED', 'APPROVED'] as const) {
      const res = await patch(app, 'req-1', { status: to, adminComment: 'Because.' });
      expect(res.status).toBe(to);
    }
    expect((await newAudits(app)).map((r) => (r.metadata as { to: string }).to)).toEqual([
      'APPROVED',
      'PENDING',
      'IN_REVIEW',
      'REJECTED',
      'APPROVED',
    ]);
  });

  it('requires a comment to reject, and never allows going back to SENT', async () => {
    const app = await reqApp();
    for (const body of [{ status: 'REJECTED' }, { status: 'REJECTED', adminComment: '  ' }]) {
      const err = (await patch(app, 'req-1', body).catch((e) => e)) as {
        fields: { path: string }[];
      };
      expect(status(400)(err)).toBe(true);
      expect(err.fields.map((f) => f.path)).toEqual(['adminComment']);
    }
    await expect(patch(app, 'req-1', { status: 'SENT' })).rejects.toSatisfy(status(400));
    await expect(patch(app, 'req-1', { status: 'DONE' })).rejects.toSatisfy(status(400));
    await expect(patch(app, 'req-1', {})).rejects.toSatisfy(status(400));
    await expect(
      patch(app, 'req-1', { status: 'PENDING', adminComment: 'x'.repeat(2001) }),
    ).rejects.toSatisfy(status(400));
    await expect(patch(app, 'req-1', { status: 'PENDING', adminComment: 5 })).rejects.toSatisfy(
      status(400),
    );
    expect((await stored(app, 'req-1')).status).toBe('SENT');
    expect(await newAudits(app)).toEqual([]);
  });

  it('is a 404 for an unknown request (checked after the body)', async () => {
    const app = await reqApp();
    await expect(patch(app, 'nope', { status: 'PENDING' })).rejects.toSatisfy(
      status(404, 'request.not_found'),
    );
  });

  it('audits every change as asset_request.status_change { from, to, adminComment? }', async () => {
    const app = await reqApp();
    await patch(app, 'req-1', { status: 'IN_REVIEW' });
    await patch(app, 'req-1', { status: 'REJECTED', adminComment: 'Not for us.' });
    const rows = await newAudits(app);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      action: 'asset_request.status_change',
      subjectType: 'AssetRequest',
      subjectId: 'req-1',
      actorId: FX_PERSONA,
      metadata: { from: 'SENT', to: 'IN_REVIEW' },
      createdAt: '2026-06-10T12:00:00.000Z',
    });
    expect(rows[1]!.metadata).toEqual({
      from: 'IN_REVIEW',
      to: 'REJECTED',
      adminComment: 'Not for us.',
    });
  });

  it('tells the requester when that is the persona (backend semantics: always the requester)', async () => {
    const app = await reqApp();
    await patch(app, 'req-2', { status: 'APPROVED', adminComment: 'Buy it.' });
    const rows = await notifications(app);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      type: 'REQUEST_STATUS_CHANGED',
      readAt: null,
      createdAt: '2026-06-10T12:00:00.000Z',
      payload: {
        requestId: 'req-2',
        status: 'APPROVED',
        newStatus: 'APPROVED',
        adminComment: 'Buy it.',
        byAdminName: 'Aria Wijaya',
      },
    });
  });

  it('creates no notification for a requester that has no inbox in the demo', async () => {
    const app = await reqApp();
    await patch(app, 'req-1', { status: 'APPROVED', adminComment: 'Yes.' });
    expect(await notifications(app)).toEqual([]);
  });

  it('the persona sees her own decided request through /asset-requests', async () => {
    const app = await reqApp();
    await patch(app, 'req-2', { status: 'REJECTED', adminComment: 'Out of budget.' });
    const mine = await app.call<AssetRequestListPage>('GET', '/asset-requests');
    expect(mine.items).toHaveLength(1);
    expect(mine.items[0]).toMatchObject({
      id: 'req-2',
      status: 'REJECTED',
      adminComment: 'Out of budget.',
    });
  });

  it('moves the dashboard pendingRequests (SENT, IN_REVIEW and PENDING count)', async () => {
    const app = await reqApp();
    const pending = async () =>
      (await app.call<DashboardResponse>('GET', '/admin/dashboard')).counts.pendingRequests;
    expect(await pending()).toBe(3);
    await patch(app, 'req-1', { status: 'APPROVED' });
    expect(await pending()).toBe(2);
    await patch(app, 'req-3', { status: 'PENDING' });
    expect(await pending()).toBe(3);
  });
});

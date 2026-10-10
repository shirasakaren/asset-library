import { describe, it, expect } from 'vitest';
import { bus, type PreviewEvent } from '@/preview/events/bus';
import { notifyPersonaOfRequest } from '@/preview/handlers/requests';
import type { NotificationRecord, RequestRecord } from '@/preview/records';
import type { AssetRequest, AssetRequestListPage } from '@/lib/api/types';
import { appWith, status } from './social-fixtures';
import {
  FX_OTHER,
  FX_PERSONA,
  req,
  T,
  VALID_REQUEST as VALID,
  withUsers,
} from './community-fixtures';

describe('POST /asset-requests', () => {
  it('creates a SENT request for the persona and returns the AssetRequest shape', async () => {
    const app = await appWith([], {}, withUsers());
    const r = await app.call<AssetRequest>('POST', '/asset-requests', { body: VALID });
    expect(r).toMatchObject({
      assetLink: VALID.assetLink,
      assetType: VALID.assetType,
      intendedUse: VALID.intendedUse,
      price: null,
      notes: null,
      status: 'SENT',
      adminComment: null,
      requester: { id: FX_PERSONA, displayName: 'Aria Wijaya' },
    });
    expect(r.id).toBeTruthy();
    expect(r.createdAt).toBe(r.updatedAt);
    const stored = await app.db.get<RequestRecord>('requests', r.id);
    expect(stored).toMatchObject({ requesterId: FX_PERSONA, reviewedById: null, status: 'SENT' });
    expect(stored).not.toHaveProperty('requester');
  });

  it('keeps optional price and notes, and treats an empty notes string as none', async () => {
    const app = await appWith([], {}, withUsers());
    const a = await app.call<AssetRequest>('POST', '/asset-requests', {
      body: { ...VALID, price: 12.5, notes: 'Please check the license.' },
    });
    expect(a).toMatchObject({ price: 12.5, notes: 'Please check the license.' });
    const b = await app.call<AssetRequest>('POST', '/asset-requests', {
      body: { ...VALID, price: 0, notes: '' },
    });
    expect(b).toMatchObject({ price: 0, notes: null });
    const c = await app.call<AssetRequest>('POST', '/asset-requests', {
      body: { ...VALID, price: '9.99' },
    });
    expect(c.price).toBe(9.99);
  });

  const bad: Array<[string, unknown, string]> = [
    ['no body', undefined, 'assetLink'],
    ['body is a string', 'x', 'assetLink'],
    ['missing assetLink', { ...VALID, assetLink: undefined }, 'assetLink'],
    ['not a url', { ...VALID, assetLink: 'not a url' }, 'assetLink'],
    ['no protocol', { ...VALID, assetLink: 'store.example.test/x' }, 'assetLink'],
    ['javascript url', { ...VALID, assetLink: 'javascript:alert(1)' }, 'assetLink'],
    ['oversize link', { ...VALID, assetLink: `https://x.test/${'a'.repeat(500)}` }, 'assetLink'],
    ['missing assetType', { ...VALID, assetType: undefined }, 'assetType'],
    ['blank assetType', { ...VALID, assetType: '   ' }, 'assetType'],
    ['oversize assetType', { ...VALID, assetType: 'a'.repeat(81) }, 'assetType'],
    ['numeric assetType', { ...VALID, assetType: 5 }, 'assetType'],
    ['missing intendedUse', { ...VALID, intendedUse: undefined }, 'intendedUse'],
    ['blank intendedUse', { ...VALID, intendedUse: '' }, 'intendedUse'],
    ['oversize intendedUse', { ...VALID, intendedUse: 'a'.repeat(2001) }, 'intendedUse'],
    ['negative price', { ...VALID, price: -1 }, 'price'],
    ['price NaN string', { ...VALID, price: 'abc' }, 'price'],
    ['price Infinity', { ...VALID, price: Infinity }, 'price'],
    ['oversize notes', { ...VALID, notes: 'a'.repeat(2001) }, 'notes'],
    ['notes not a string', { ...VALID, notes: 4 }, 'notes'],
  ];
  it.each(bad)('rejects %s with a 400 and a field entry', async (_n, body, path) => {
    const app = await appWith([], {}, withUsers());
    const err = await app.call('POST', '/asset-requests', { body }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toSatisfy(status(400));
    const fields = (err as { fields?: Array<{ path: string; code: string; message: string }> })
      .fields!;
    expect(fields.map((f) => f.path)).toContain(path);
    expect(fields[0]).toEqual({
      path: expect.any(String),
      code: expect.any(String),
      message: expect.any(String),
    });
    expect(await app.db.list('requests')).toHaveLength(0);
  });

  it('reports every invalid field at once', async () => {
    const app = await appWith([], {}, withUsers());
    const err = await app
      .call('POST', '/asset-requests', { body: { assetLink: 'x', assetType: '', intendedUse: '' } })
      .catch((e: unknown) => e);
    expect((err as { fields: Array<{ path: string }> }).fields.map((f) => f.path).sort()).toEqual([
      'assetLink',
      'assetType',
      'intendedUse',
    ]);
  });

  it('does not notify the persona about their own request, and writes no audit row', async () => {
    const app = await appWith([], {}, withUsers());
    await app.call('POST', '/asset-requests', { body: VALID });
    expect(await app.db.list('notifications')).toHaveLength(0);
    // the backend does not audit requester actions
    expect(await app.db.list('audit')).toHaveLength(0);
  });
});

describe('notifyPersonaOfRequest', () => {
  it('tells an admin persona about a request from someone else', async () => {
    const app = await appWith([], {}, withUsers());
    const events: PreviewEvent[] = [];
    const off = bus.on((e) => events.push(e));
    const row = req('req-x', { requesterId: FX_OTHER });
    const id = await notifyPersonaOfRequest(app.ctx, row, {
      id: FX_OTHER,
      displayName: 'Kenji Matsuda',
    });
    off();
    const n = await app.db.get<NotificationRecord>('notifications', id!);
    expect(n).toMatchObject({
      type: 'REQUEST_CREATED',
      readAt: null,
      payload: { requestId: 'req-x', requesterName: 'Kenji Matsuda', assetType: '3D model' },
    });
    expect(events).toContainEqual({ type: 'notification', notificationId: id });
  });

  it('does nothing for the persona own request or for a non-admin persona', async () => {
    const app = await appWith([], {}, withUsers());
    expect(
      await notifyPersonaOfRequest(app.ctx, req('r1'), { id: FX_PERSONA, displayName: 'Aria' }),
    ).toBeUndefined();
    const plain = await appWith([], { meId: 'u-third' }, withUsers());
    expect(
      await notifyPersonaOfRequest(plain.ctx, req('r2', { requesterId: FX_OTHER }), {
        id: FX_OTHER,
        displayName: 'K',
      }),
    ).toBeUndefined();
    expect(await app.db.list('notifications')).toHaveLength(0);
    expect(await plain.db.list('notifications')).toHaveLength(0);
  });
});

describe('GET /asset-requests', () => {
  const rows = [
    req('r-a', { createdAt: T(1), status: 'SENT' }),
    req('r-b', { createdAt: T(3), status: 'PENDING' }),
    req('r-c', { createdAt: T(3), status: 'APPROVED' }),
    req('r-d', { createdAt: T(2), status: 'REJECTED', requesterId: FX_OTHER }),
    req('r-e', { createdAt: T(4), status: 'SENT', requesterId: 'u-third' }),
    req('r-f', { createdAt: T(5), status: 'PENDING', requesterId: FX_OTHER }),
  ];
  const listApp = (opts: { meId?: string } = {}) =>
    appWith([], opts, { ...withUsers(), requests: rows });

  it('lists the persona own requests newest first, id descending on ties', async () => {
    const app = await listApp();
    const page = await app.call<AssetRequestListPage>('GET', '/asset-requests');
    expect(page.items.map((r) => r.id)).toEqual(['r-c', 'r-b', 'r-a']);
    expect(page.pageInfo).toEqual({ nextCursor: null, hasMore: false });
    expect(page.items[0]).toMatchObject({
      id: 'r-c',
      requester: { id: FX_PERSONA, displayName: 'Aria Wijaya' },
    });
    expect(page.items[0]).not.toHaveProperty('requesterId');
    expect(page.items[0]).not.toHaveProperty('reviewedById');
  });

  it('lets an admin pick another requester, and filter by status', async () => {
    const app = await listApp();
    const other = await app.call<AssetRequestListPage>('GET', '/asset-requests', {
      query: { requesterId: FX_OTHER },
    });
    expect(other.items.map((r) => r.id)).toEqual(['r-f', 'r-d']);
    const pending = await app.call<AssetRequestListPage>('GET', '/asset-requests', {
      query: { status: 'PENDING' },
    });
    expect(pending.items.map((r) => r.id)).toEqual(['r-b']);
    const both = await app.call<AssetRequestListPage>('GET', '/asset-requests', {
      query: { status: 'PENDING', requesterId: FX_OTHER },
    });
    expect(both.items.map((r) => r.id)).toEqual(['r-f']);
  });

  it('rejects an unknown status', async () => {
    const app = await listApp();
    await expect(
      app.call('GET', '/asset-requests', { query: { status: 'DONE' } }),
    ).rejects.toSatisfy(status(400));
  });

  it('ignores requesterId for a non-admin persona', async () => {
    const app = await listApp({ meId: FX_OTHER });
    const page = await app.call<AssetRequestListPage>('GET', '/asset-requests', {
      query: { requesterId: FX_PERSONA },
    });
    expect(page.items.map((r) => r.id)).toEqual(['r-f', 'r-d']);
  });

  it('walks the pages without duplicates or gaps and clamps the limit', async () => {
    const many = Array.from({ length: 23 }, (_, i) =>
      req(`r-${String(i).padStart(2, '0')}`, { createdAt: T(i % 5) }),
    );
    const app = await appWith([], {}, { ...withUsers(), requests: many });
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let guard = 0; guard < 20; guard += 1) {
      const p = await app.call<AssetRequestListPage>('GET', '/asset-requests', {
        query: { limit: 5, cursor },
      });
      expect(p.items.length).toBeLessThanOrEqual(5);
      seen.push(...p.items.map((r) => r.id));
      if (!p.pageInfo.hasMore) break;
      cursor = p.pageInfo.nextCursor!;
    }
    expect(seen).toHaveLength(23);
    expect(new Set(seen).size).toBe(23);
    const big = await app.call<AssetRequestListPage>('GET', '/asset-requests', {
      query: { limit: 5000 },
    });
    expect(big.items).toHaveLength(23);
  });

  it('shows a request created through the API at the top', async () => {
    const app = await listApp();
    const made = await app.call<AssetRequest>('POST', '/asset-requests', { body: VALID });
    const page = await app.call<AssetRequestListPage>('GET', '/asset-requests');
    expect(page.items[0]!.id).toBe(made.id);
  });
});

describe('GET /asset-requests/{id}', () => {
  const rows = [
    req('r-mine'),
    req('r-theirs', { requesterId: FX_OTHER, reviewedById: FX_PERSONA }),
  ];

  it('returns the AssetRequest for the requester', async () => {
    const app = await appWith([], {}, { ...withUsers(), requests: rows });
    const r = await app.call<AssetRequest>('GET', '/asset-requests/r-mine');
    expect(r.id).toBe('r-mine');
    expect(r.requester).toEqual({ id: FX_PERSONA, displayName: 'Aria Wijaya' });
  });

  it('lets an admin open anyone request', async () => {
    const app = await appWith([], {}, { ...withUsers(), requests: rows });
    const r = await app.call<AssetRequest>('GET', '/asset-requests/r-theirs');
    expect(r.requester.displayName).toBe('Kenji Matsuda');
  });

  it('answers 404 for someone else request (non-admin) and for unknown ids', async () => {
    const app = await appWith([], { meId: 'u-third' }, { ...withUsers(), requests: rows });
    await expect(app.call('GET', '/asset-requests/r-mine')).rejects.toSatisfy(
      status(404, 'request.not_found'),
    );
    await expect(app.call('GET', '/asset-requests/nope')).rejects.toSatisfy(
      status(404, 'request.not_found'),
    );
  });

  it('survives a requester that no longer exists', async () => {
    const app = await appWith(
      [],
      {},
      { ...withUsers(), requests: [req('r-x', { requesterId: 'u-ghost' })] },
    );
    const r = await app.call<AssetRequest>('GET', '/asset-requests/r-x');
    expect(r.requester).toEqual({ id: 'u-ghost', displayName: '(unknown)' });
  });
});

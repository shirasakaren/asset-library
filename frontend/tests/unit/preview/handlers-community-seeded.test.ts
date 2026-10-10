import { describe, it, expect } from 'vitest';
import { createSeededTestApp } from '@/preview/test-utils';
import type { AssetRequest, AssetRequestListPage, MeResponse } from '@/lib/api/types';
import type {
  AuditRecord,
  DeviceRecord,
  ReportRecord,
  RequestRecord,
  UserRecord,
} from '@/preview/records';

describe('community handlers over the real seed', () => {
  it('lists the persona requests by default and fetches every seeded request', async () => {
    const app = await createSeededTestApp({ timers: false });
    const rows = await app.db.list<RequestRecord>('requests');
    expect(rows.length).toBeGreaterThanOrEqual(12);

    const mine = await app.call<AssetRequestListPage>('GET', '/asset-requests', {
      query: { limit: 100 },
    });
    expect(mine.items.map((r) => r.id).sort()).toEqual(
      rows
        .filter((r) => r.requesterId === 'u-persona')
        .map((r) => r.id)
        .sort(),
    );
    expect(mine.items.length).toBeGreaterThanOrEqual(2);
    expect(mine.items.every((r) => r.requester.id === 'u-persona')).toBe(true);

    // every seeded request is listable (per requester) and fetchable
    const requesters = [...new Set(rows.map((r) => r.requesterId))];
    const listed: string[] = [];
    for (const requesterId of requesters) {
      const p = await app.call<AssetRequestListPage>('GET', '/asset-requests', {
        query: { requesterId, limit: 100 },
      });
      listed.push(...p.items.map((r) => r.id));
    }
    expect(listed.sort()).toEqual(rows.map((r) => r.id).sort());
    for (const r of rows) {
      const got = await app.call<AssetRequest>('GET', `/asset-requests/${r.id}`);
      expect(got.status).toBe(r.status);
      expect(got.requester.displayName).not.toBe('(unknown)');
    }
    // every status filter returns only that status
    for (const s of new Set(rows.map((r) => r.status))) {
      const p = await app.call<AssetRequestListPage>('GET', '/asset-requests', {
        query: { status: s, requesterId: 'u-persona', limit: 100 },
      });
      expect(p.items.every((r) => r.status === s)).toBe(true);
    }
  });

  it('creates a request and a report that join the seeded collections', async () => {
    const app = await createSeededTestApp({ timers: false });
    const before = (await app.db.list('requests')).length;
    const made = await app.call<AssetRequest>('POST', '/asset-requests', {
      body: {
        assetLink: 'https://example.test/asset',
        assetType: 'Shader',
        intendedUse: 'Testing the request flow of the demo.',
      },
    });
    expect((await app.db.list('requests')).length).toBe(before + 1);
    const page = await app.call<AssetRequestListPage>('GET', '/asset-requests');
    expect(page.items[0]!.id).toBe(made.id);

    const assets = await app.db.list<{ id: string; status: string }>('assets');
    const target = assets.find((a) => a.status === 'PUBLISHED')!;
    const reportsBefore = (await app.db.list('reports')).length;
    const { id } = await app.call<{ id: string }>('POST', '/reports', {
      body: { assetId: target.id, category: 'MALICIOUS_FILE', notes: 'Looks suspicious to me.' },
    });
    const stored = (await app.db.get<ReportRecord>('reports', id))!;
    expect(stored).toMatchObject({ status: 'OPEN', assetId: target.id, reporterId: 'u-persona' });
    expect((await app.db.list('reports')).length).toBe(reportsBefore + 1);
  });

  it('lists only the active seeded device and revokes it', async () => {
    const app = await createSeededTestApp({ timers: false });
    const list = await app.call<Array<{ id: string }>>('GET', '/auth/plugin/devices');
    expect(list.map((d) => d.id)).toEqual(['dev-1']);
    const me = await app.call<MeResponse & { devices: Array<{ id: string }> }>('GET', '/me');
    expect(me.devices.map((d) => d.id)).toEqual(['dev-1']);
    await app.call('POST', '/me/devices/dev-1/revoke');
    expect(await app.call('GET', '/auth/plugin/devices')).toEqual([]);
    // a previously revoked device keeps its original timestamp
    await app.call('DELETE', '/auth/plugin/devices/dev-2');
    const dev2 = await app.db.get<DeviceRecord>('devices', 'dev-2');
    expect(dev2!.revokedAt).toBe('2026-09-18T21:00:00.000Z');
    const audit = (await app.db.list<AuditRecord>('audit')).filter(
      (a) => a.subjectId === 'dev-1' && a.action === 'me.revoke_device',
    );
    expect(audit).toHaveLength(1);
  });

  it('serves public profiles for every seeded user and finds Aria by search', async () => {
    const app = await createSeededTestApp({ timers: false });
    const users = await app.db.list<UserRecord>('users');
    for (const u of users) {
      const p = await app.call<{ displayName: string; publishedAssetCount: number }>(
        'GET',
        `/users/${u.id}`,
      );
      expect(p.displayName).toBe(u.displayName);
      expect(p.publishedAssetCount).toBeGreaterThanOrEqual(0);
    }
    const hits = await app.call<Array<{ id: string }>>('GET', '/users/search', {
      query: { q: 'ar' },
    });
    expect(hits.some((h) => h.id === 'u-persona')).toBe(true);
    expect(hits.length).toBeLessThanOrEqual(20);
  });
});

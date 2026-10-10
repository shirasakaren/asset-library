import { describe, it, expect } from 'vitest';
import { createSeededTestApp, type TestApp } from '@/preview/test-utils';
import type {
  AdminAuditPage,
  AdminStorageAssetRow,
  AdminStorageUserRow,
  DashboardResponse,
} from '@/lib/api/admin-types';
import type {
  AnalyticsRecord,
  AssetRecord,
  AuditRecord,
  PlatformAnalyticsRecord,
  StorageRecord,
  UserRecord,
} from '@/preview/records';

/** The seed is anchored at 2026-10-01; the clock stands a few days later, like a real visit. */
const app = async (meId?: string): Promise<TestApp> => {
  const a = await createSeededTestApp({ timers: false, meId });
  a.ctx.now = () => new Date('2026-10-10T12:00:00.000Z');
  return a;
};

describe('admin dashboard over the real seed', () => {
  it('counts the seeded data and keeps the exact stored last-30-day downloads', async () => {
    const a = await app();
    const d = await a.call<DashboardResponse>('GET', '/admin/dashboard');
    const assets = await a.db.list<AssetRecord>('assets');
    const count = (s: string) => assets.filter((x) => x.status === s).length;
    expect(d.counts).toMatchObject({
      users: 25,
      publishedAssets: count('PUBLISHED'),
      draftAssets: count('DRAFT'),
      archivedAssets: count('ARCHIVED'),
      pendingReports: 5,
      pendingRequests: 7,
      avInfected: 1,
    });
    const platform = (await a.db.get<AnalyticsRecord>(
      'analytics',
      'an-platform',
    )) as PlatformAnalyticsRecord;
    const last30 = platform.downloads.slice(-30);
    expect(d.counts.downloads30d).toBe(last30.reduce((s, n) => s + n, 0));
    // far later than the anchor, the charts still show the seeded days (window ends 2026-09-30)
    expect(d.charts.downloads30d.map((p) => p.count)).toEqual(last30);
    expect(d.charts.downloads30d[29]!.date).toBe('2026-09-30');
    expect(d.charts.downloads30d[0]!.date).toBe('2026-09-01');
  });

  it('has publishes and sign-ups in the window, a leaderboard and ten audit rows', async () => {
    const a = await app();
    const d = await a.call<DashboardResponse>('GET', '/admin/dashboard');
    expect(d.charts.publishes30d).toHaveLength(30);
    expect(d.charts.publishes30d.reduce((s, p) => s + p.count, 0)).toBeGreaterThan(0);
    expect(d.charts.newUsers30d).toHaveLength(30);

    expect(d.topAssets7d).toHaveLength(10);
    const dl = d.topAssets7d.map((x) => x.downloads);
    expect(dl).toEqual([...dl].sort((x, y) => y - x));
    expect(
      d.topAssets7d.every((x) => x.title && x.slug && x.ownerDisplayName !== 'Unknown user'),
    ).toBe(true);

    expect(d.recentAudit).toHaveLength(10);
    const times = d.recentAudit.map((x) => x.createdAt);
    expect(times).toEqual([...times].sort().reverse());
    expect(d.recentAudit.every((x) => x.actorId === null || x.actorDisplayName)).toBe(true);
  });

  it('reports the five seeded buckets', async () => {
    const a = await app();
    const d = await a.call<DashboardResponse>('GET', '/admin/dashboard');
    const stored = (await a.db.list<StorageRecord>('storage')).filter((s) => s.kind === 'bucket');
    expect(d.storage.byBucket.map((b) => b.bucket)).toEqual([
      'source',
      'derived',
      'thumbs',
      'featured',
      'editor',
    ]);
    expect(d.storage.totalBytes).toBe(stored.reduce((s, b) => s + b.bytes, 0));
  });
});

describe('admin storage over the real seed', () => {
  it('derives the user rows from their assets and matches every stored user rollup', async () => {
    const a = await app();
    const rows = await a.call<AdminStorageUserRow[]>('GET', '/admin/storage/users', {
      query: { date: '2026-09-30', limit: 200 },
    });
    const stored = (await a.db.list<StorageRecord>('storage')).filter((s) => s.kind === 'user');
    expect(rows).toHaveLength(stored.length);
    for (const s of stored) {
      const row = rows.find((r) => r.userId === s.refId)!;
      expect(row.bytes, s.refId).toBe(s.bytes);
      expect(row.spark.map((p) => p.bytes)).toEqual(s.spark);
    }
    const bytes = rows.map((r) => r.bytes);
    expect(bytes).toEqual([...bytes].sort((x, y) => y - x));
    expect(rows[0]!.displayName).toBeTruthy();
    expect(rows[0]!.email).toContain('@');
  });

  it('lists every asset with its spark and answers the page request (limit 100)', async () => {
    const a = await app();
    const all = await a.call<AdminStorageAssetRow[]>('GET', '/admin/storage/assets', {
      query: { limit: 200 },
    });
    expect(all).toHaveLength(151);
    const page = await a.call<AdminStorageAssetRow[]>('GET', '/admin/storage/assets', {
      query: { date: '2026-10-10', limit: 100 },
    });
    expect(page).toHaveLength(100);
    expect(page[0]!.spark).toHaveLength(30);
    expect(page[0]!.title).toBeTruthy();
    // a past date inside the series still has rows
    const past = await a.call<AdminStorageAssetRow[]>('GET', '/admin/storage/assets', {
      query: { date: '2026-09-15', limit: 200 },
    });
    expect(past.length).toBeGreaterThan(100);
  });
});

describe('admin audit over the real seed', () => {
  it('walks all seeded rows newest first, once each, and filters by actor', async () => {
    const a = await app();
    const seeded = await a.db.list<AuditRecord>('audit');
    const ids: string[] = [];
    let cursor: string | undefined;
    do {
      const page: AdminAuditPage = await a.call('GET', '/admin/audit', {
        query: { limit: 50, cursor },
      });
      ids.push(...page.items.map((x) => x.id));
      cursor = page.pageInfo.hasMore ? (page.pageInfo.nextCursor ?? undefined) : undefined;
    } while (cursor);
    expect(ids).toHaveLength(seeded.length);
    expect(new Set(ids).size).toBe(seeded.length);

    const mine = await a.call<AdminAuditPage>('GET', '/admin/audit', {
      query: { actorId: 'u-persona', limit: 100 },
    });
    expect(mine.items).toHaveLength(seeded.filter((r) => r.actorId === 'u-persona').length);
    const entry = await a.call<{ id: string; actorDisplayName: string | null }>(
      'GET',
      `/admin/audit/${mine.items[0]!.id}`,
    );
    expect(entry.actorDisplayName).toBe('Aria Wijaya');
  });

  it('puts a new row above the seeded ones and keeps the order', async () => {
    const a = await app();
    await a.call('POST', '/me/logout');
    const page = await a.call<AdminAuditPage>('GET', '/admin/audit', { query: { limit: 3 } });
    expect(page.items[0]).toMatchObject({
      action: 'me.logout',
      actorDisplayName: 'Aria Wijaya',
      createdAt: '2026-10-10T12:00:00.000Z',
    });
    expect(page.items[1]!.createdAt <= page.items[0]!.createdAt).toBe(true);
  });
});

describe('admin analytics and queues over the real seed', () => {
  it('serves the three analytics views and the queue list', async () => {
    const a = await app();
    const platform = await a.call<{ daily: unknown[]; totals: { downloads: number } }>(
      'GET',
      '/admin/analytics/platform',
    );
    expect(platform.daily).toHaveLength(30);
    expect(platform.totals.downloads).toBeGreaterThan(0);

    const assets = await a.call<Array<{ totalDownloads: number }>>(
      'GET',
      '/admin/analytics/assets',
      {
        query: { limit: 5 },
      },
    );
    expect(assets).toHaveLength(5);
    expect(assets[0]!.totalDownloads).toBeGreaterThanOrEqual(assets[4]!.totalDownloads);

    const users = await a.call<Array<{ displayName: string }>>('GET', '/admin/analytics/users');
    expect(users.length).toBeGreaterThan(5);

    const queues = await a.call<{ queues: unknown[] }>('GET', '/admin/queues');
    expect(queues.queues).toHaveLength(14);
  });

  it('answers 403 for a non-admin persona on the dashboard', async () => {
    const probe = await createSeededTestApp({ timers: false });
    const users = await probe.db.list<UserRecord>('users');
    const plain = users.find((u) => !u.isAdmin)!;
    const a = await app(plain.id);
    await expect(a.call('GET', '/admin/dashboard')).rejects.toMatchObject({ status: 403 });
  });
});

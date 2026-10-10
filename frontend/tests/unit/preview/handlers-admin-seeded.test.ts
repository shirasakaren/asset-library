import { describe, it, expect } from 'vitest';
import { createSeededTestApp, type TestApp } from '@/preview/test-utils';
import type {
  AdminAssetListPage,
  AdminAuditPage,
  AdminStorageAssetRow,
  AdminStorageUserRow,
  AdminUserPage,
  DashboardResponse,
} from '@/lib/api/admin-types';
import type {
  AnalyticsRecord,
  AssetRecord,
  AuditRecord,
  PlatformAnalyticsRecord,
  StorageRecord,
  TagRecord,
  UserRecord,
} from '@/preview/records';

/** The seed is anchored at 2026-10-01 and rebased onto the clock (9 days later): like a real visit. */
const app = (meId?: string): Promise<TestApp> =>
  createSeededTestApp({ timers: false, meId, now: '2026-10-10T12:00:00.000Z' });

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
    // rebased seed: its series end yesterday, the chart ends today (a 0 for today)
    expect(d.charts.downloads30d.map((p) => p.count)).toEqual([...last30.slice(-29), 0]);
    expect(d.charts.downloads30d[29]!.date).toBe('2026-10-10');
    expect(d.charts.downloads30d[0]!.date).toBe('2026-09-11');
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
    const stored = (await a.db.list<StorageRecord>('storage')).filter((s) => s.kind === 'user');
    const rows = await a.call<AdminStorageUserRow[]>('GET', '/admin/storage/users', {
      query: { date: stored[0]!.asOfDate, limit: 200 },
    });
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
      query: { date: '2026-09-24', limit: 200 },
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

describe('admin assets and users over the real seed', () => {
  const confirm = () => ({ confirm: 'I understand', confirmedAt: '2026-10-10T11:59:50.000Z' });

  it('lists all 151 assets with the global counts and pages without duplicates', async () => {
    const a = await app();
    const first = await a.call<AdminAssetListPage>('GET', '/admin/assets', {
      query: { limit: 50 },
    });
    expect(first.counts).toEqual({ DRAFT: 12, PUBLISHED: 132, ARCHIVED: 7, DELETED: 0 });
    const ids: string[] = [];
    let page = first;
    for (;;) {
      ids.push(...page.items.map((x) => x.id));
      if (!page.pageInfo.hasMore) break;
      page = await a.call<AdminAssetListPage>('GET', '/admin/assets', {
        query: { limit: 50, cursor: page.pageInfo.nextCursor },
      });
    }
    expect(ids).toHaveLength(151);
    expect(new Set(ids).size).toBe(151);
    expect(first.items.every((r) => r.ownerEmail && r.categoryName && r.ownerDisplayName)).toBe(
      true,
    );
    const published = await a.call<AdminAssetListPage>('GET', '/admin/assets', {
      query: { status: 'PUBLISHED', limit: 100, sort: 'mostDownloaded' },
    });
    expect(published.items).toHaveLength(100);
    const dl = published.items.map((r) => r.totalDownloads);
    expect(dl).toEqual([...dl].sort((x, y) => y - x));
    const search = await a.call<AdminAssetListPage>('GET', '/admin/assets', {
      query: { q: 'ultimate prop' },
    });
    expect(search.items.length).toBeGreaterThan(0);
  });

  it('archive, restore and transfer keep the dashboard and the audit log consistent', async () => {
    const a = await app();
    const assets = await a.db.list<AssetRecord>('assets');
    const target = assets.find((x) => x.status === 'PUBLISHED' && x.ownerId !== 'u-persona')!;
    const dash = () => a.call<DashboardResponse>('GET', '/admin/dashboard');
    const before = (await dash()).counts;

    await a.call('POST', `/admin/assets/${target.id}/archive`, {
      body: { reason: 'Outdated page' },
    });
    const mid = (await dash()).counts;
    expect(mid.publishedAssets).toBe(before.publishedAssets - 1);
    expect(mid.archivedAssets).toBe(before.archivedAssets + 1);
    await a.call('POST', `/admin/assets/${target.id}/restore`);
    expect((await dash()).counts.publishedAssets).toBe(before.publishedAssets);

    await a.call('POST', `/admin/assets/${target.id}/transfer`, {
      body: { newOwnerId: 'u-persona', ...confirm() },
    });
    const owned = await a.call<AdminAssetListPage>('GET', '/admin/assets', {
      query: { ownerId: 'u-persona', limit: 100 },
    });
    expect(owned.items.some((r) => r.id === target.id)).toBe(true);

    const log = await a.call<AdminAuditPage>('GET', '/admin/audit', { query: { limit: 3 } });
    expect(log.items.map((x) => x.action)).toEqual([
      'asset.transfer',
      'asset.admin_restore',
      'asset.admin_archive',
    ]);
    expect(log.items.every((x) => x.actorDisplayName === 'Aria Wijaya')).toBe(true);
    // a seeded row, for the shape
    const seededRow = await a.call<AdminAuditPage['items'][number]>('GET', '/admin/audit/au-001');
    expect(Object.keys(log.items[0]!).sort()).toEqual(Object.keys(seededRow).sort());
    const sorted = (
      await a.call<AdminAuditPage>('GET', '/admin/audit', { query: { limit: 100 } })
    ).items.map((x) => x.createdAt);
    expect(sorted).toEqual([...sorted].sort().reverse());
  });

  it('force delete removes the asset everywhere and releases its tags', async () => {
    const a = await app();
    const assets = await a.db.list<AssetRecord>('assets');
    const target = assets.find((x) => x.status === 'PUBLISHED' && x.tagIds.length > 0)!;
    const tag = target.tagIds[0]!;
    const usage = async () => ((await a.db.get<TagRecord>('tags', tag)) as TagRecord).usageCount;
    const before = await usage();
    await a.call('POST', `/admin/assets/${target.id}/force-delete`, {
      body: { reason: 'Legal takedown', ...confirm() },
    });
    expect(await usage()).toBe(before - 1);
    await expect(a.call('GET', `/assets/${target.id}`)).rejects.toMatchObject({ status: 404 });
    const rows = await a.call<AdminAssetListPage>('GET', '/admin/assets', {
      query: { limit: 100 },
    });
    expect(rows.counts.PUBLISHED).toBe(131);
    const storage = await a.call<AdminStorageAssetRow[]>('GET', '/admin/storage/assets', {
      query: { limit: 200 },
    });
    expect(storage.some((r) => r.assetId === target.id)).toBe(false);
  });

  it('lists the 25 users, three admins, and promotes and demotes with the guards', async () => {
    const a = await app();
    const all: string[] = [];
    let cursor: string | undefined;
    do {
      const page: AdminUserPage = await a.call('GET', '/admin/users', {
        query: { limit: 10, cursor },
      });
      all.push(...page.items.map((u) => u.id));
      cursor = page.pageInfo.hasMore ? (page.pageInfo.nextCursor ?? undefined) : undefined;
    } while (cursor);
    expect(all).toHaveLength(25);
    expect(new Set(all).size).toBe(25);
    const admins = await a.call<AdminUserPage>('GET', '/admin/users', {
      query: { isAdmin: 'true', limit: 50 },
    });
    expect(admins.items.map((u) => u.id).sort()).toEqual(
      ['u-kenji-matsuda', 'u-persona', 'u-siti-rahmawati'].sort(),
    );

    await a.call('POST', '/admin/users/u-kenji-matsuda/demote', { body: confirm() });
    await expect(
      a.call('POST', '/admin/users/u-persona/demote', { body: confirm() }),
    ).rejects.toMatchObject({ status: 409, code: 'users.self_demote_preview' });
    await a.call('POST', '/admin/users/u-siti-rahmawati/demote', { body: confirm() });
    await expect(
      a.call('POST', '/admin/users/u-persona/demote', { body: confirm() }),
    ).rejects.toMatchObject({ status: 409, code: 'admin.cannot_remove_last_admin' });
    await a.call('POST', '/admin/users/u-kenji-matsuda/promote', { body: confirm() });
    const now = await a.call<AdminUserPage>('GET', '/admin/users', {
      query: { isAdmin: 'true', limit: 50 },
    });
    expect(now.items.map((u) => u.id).sort()).toEqual(['u-kenji-matsuda', 'u-persona']);
    const me = await a.call<{ role: string }>('GET', '/auth/me');
    expect(me.role).toBe('admin');
  });
});

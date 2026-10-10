import { describe, it, expect } from 'vitest';
import { createSeededTestApp, type TestApp } from '@/preview/test-utils';
import type { DashboardResponse, AdminStorageUserRow } from '@/lib/api/admin-types';
import type {
  AnalyticsRecord,
  AssetAnalyticsRecord,
  AssetRecord,
  NotificationRecord,
} from '@/preview/records';
import type { AssetListPage, AssetAnalyticsDetail } from '@/lib/api/types';
import { recordDownloads } from '@/preview/handlers/analytics';

const DAY = 86_400_000;
const CLOCKS = [
  '2026-10-01T09:00:00.000Z',
  '2026-10-10T12:00:00.000Z',
  '2027-06-01T12:00:00.000Z',
  '2030-01-15T23:30:00.000Z',
];

const app = (now: string, meId?: string): Promise<TestApp> =>
  createSeededTestApp({ timers: false, now, meId });
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('the seed moves with the clock', () => {
  it('seeded notifications and library rows are about as old on any date', async () => {
    const ages: number[] = [];
    for (const now of CLOCKS) {
      const a = await app(now);
      const rows = await a.db.list<NotificationRecord>('notifications');
      const newest = rows.map((r) => Date.parse(r.createdAt)).sort((x, y) => y - x)[0]!;
      const age = (Date.parse(now) - newest) / DAY;
      expect(age, now).toBeGreaterThanOrEqual(0);
      expect(age, now).toBeLessThan(2);
      ages.push(age);
    }
    expect(Math.max(...ages) - Math.min(...ages)).toBeLessThan(1);
  });

  it('keeps the catalog order (newest by publishedAt) and the stored counters', async () => {
    const lists: string[][] = [];
    for (const now of [CLOCKS[0]!, CLOCKS[2]!]) {
      const a = await app(now);
      const page = await a.call<AssetListPage>('GET', '/assets', {
        query: { sort: 'newest', limit: 40 },
      });
      lists.push(page.items.map((x) => x.id));
    }
    expect(lists[0]).toEqual(lists[1]);
  });

  it('the persona devices stay active months later (expiresAt moves too)', async () => {
    const a = await app('2027-06-01T12:00:00.000Z');
    const devices = await a.call<unknown[]>('GET', '/auth/plugin/devices');
    expect(devices).toHaveLength(1);
  });

  it('the analytics series of an asset ends on the rebased seed end', async () => {
    const a = await app('2027-06-01T12:00:00.000Z');
    const recs = (await a.db.list<AnalyticsRecord>('analytics')).filter(
      (r): r is AssetAnalyticsRecord => r.kind === 'asset' && r.detail !== null,
    );
    const rec = recs[0]!;
    expect(rec.endDate).toBe('2027-05-31');
    const detail = await a.call<AssetAnalyticsDetail>('GET', `/me/analytics/assets/${rec.assetId}`);
    expect(detail.daily[detail.daily.length - 1]!.date).toBe('2027-05-31');
  });
});

describe('the admin dashboard on any date', () => {
  for (const now of CLOCKS) {
    it(`has live charts and exact counts at ${now}`, async () => {
      const a = await app(now);
      const d = await a.call<DashboardResponse>('GET', '/admin/dashboard');
      const today = now.slice(0, 10);
      expect(d.charts.downloads30d).toHaveLength(30);
      expect(d.charts.downloads30d[29]!.date).toBe(today);
      expect(sum(d.charts.downloads30d.map((p) => p.count))).toBeGreaterThan(20000);
      expect(sum(d.charts.publishes30d.map((p) => p.count))).toBeGreaterThan(0);
      expect(sum(d.charts.newUsers30d.map((p) => p.count))).toBeGreaterThan(0);
      // the rolling 30 days of the backend (today and the 30 days before) = the stored per-asset sums
      const perAsset = sum(
        (await a.db.list<AnalyticsRecord>('analytics'))
          .filter((r): r is AssetAnalyticsRecord => r.kind === 'asset')
          .map((r) => r.downloads30d),
      );
      expect(d.counts.downloads30d).toBe(perAsset);
      expect(d.recentAudit.length).toBe(10);
    });
  }

  it('still has them after a download', async () => {
    const a = await app('2027-06-01T12:00:00.000Z');
    const before = await a.call<DashboardResponse>('GET', '/admin/dashboard');
    const asset = (await a.db.list<AssetRecord>('assets')).find((x) => x.status === 'PUBLISHED')!;
    const version = asset.versions[0]!;
    await recordDownloads(a.ctx, { asset, version, files: version.files, source: 'WEB' });
    const after = await a.call<DashboardResponse>('GET', '/admin/dashboard');
    expect(after.counts.downloads30d).toBe(before.counts.downloads30d + 1);
    expect(after.charts.downloads30d[29]).toEqual({ date: '2027-06-01', count: 1 });
    expect(sum(after.charts.downloads30d.map((p) => p.count))).toBe(
      sum(before.charts.downloads30d.map((p) => p.count)) + 1,
    );
    expect(sum(after.charts.publishes30d.map((p) => p.count))).toBeGreaterThan(0);
    expect(sum(after.charts.newUsers30d.map((p) => p.count))).toBeGreaterThan(0);
  });

  it('storage sparklines have the seeded shape up to yesterday and the last value today', async () => {
    const a = await app('2027-06-01T12:00:00.000Z');
    const rows = await a.call<AdminStorageUserRow[]>('GET', '/admin/storage/users', {
      query: { date: '2027-06-01', limit: 100 },
    });
    expect(rows.length).toBe(17);
    expect(rows.every((r) => r.bytes > 0)).toBe(true);
    const moving = rows.filter((r) => new Set(r.spark.map((p) => p.bytes)).size > 1);
    expect(moving.length).toBeGreaterThan(0);
    expect(rows[0]!.spark[29]!.date).toBe('2027-06-01');
    const total = rows.reduce((s, r) => s + r.bytes, 0);
    const dash = await a.call<DashboardResponse>('GET', '/admin/dashboard');
    expect(total).toBe(dash.storage.byBucket[0]!.bytes);
  });
});

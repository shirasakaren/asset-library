import { describe, it, expect } from 'vitest';
import { fixtureAsset } from '@/preview/test-utils';
import {
  adminApp,
  FX_OTHER,
  FX_PERSONA,
  PLATFORM_LAST30,
  SEED_END,
  status,
} from './admin-fixtures';

type App = Awaited<ReturnType<typeof adminApp>>;

interface Platform {
  daily: Array<{ date: string; count: number }>;
  totals: { downloads: number; publishes: number; newUsers: number };
  bySource: Record<string, number>;
}
const platform = (app: App, query: Record<string, unknown> = {}) =>
  app.call<Platform>('GET', '/admin/analytics/platform', { query });

describe('GET /admin/analytics/platform', () => {
  it('defaults to the 30 days of the dashboard window, zero-filled', async () => {
    const app = await adminApp();
    const r = await platform(app);
    expect(r.daily).toHaveLength(30);
    expect(r.daily[29]!.date).toBe(SEED_END);
    expect(r.totals).toEqual({ downloads: PLATFORM_LAST30, publishes: 0, newUsers: 0 });
    expect(r.bySource).toEqual({});
  });

  it('takes from (inclusive) and to (exclusive) as dates', async () => {
    const app = await adminApp({
      assets: [fixtureAsset('a-p', { publishedAt: '2026-05-30T09:00:00.000Z' })],
    });
    const r = await platform(app, { from: '2026-05-30', to: '2026-06-01' });
    expect(r.daily).toEqual([
      { date: '2026-05-30', count: 88 },
      { date: '2026-05-31', count: 89 },
    ]);
    expect(r.totals.downloads).toBe(177);
    expect(r.totals.publishes).toBe(1);
  });

  it('rejects malformed or absurd ranges and is admin-only', async () => {
    const app = await adminApp();
    await expect(platform(app, { from: 'x' })).rejects.toSatisfy(status(400));
    await expect(platform(app, { from: '2026-05-31', to: '2026-05-01' })).rejects.toSatisfy(
      status(400),
    );
    await expect(platform(app, { from: '2020-01-01', to: '2026-05-01' })).rejects.toSatisfy(
      status(400),
    );
    await expect(platform(await adminApp({ meId: FX_OTHER }))).rejects.toSatisfy(status(403));
  });
});

describe('GET /admin/analytics/assets', () => {
  const rows = (app: App, query: Record<string, unknown> = {}) =>
    app.call<Array<Record<string, unknown>>>('GET', '/admin/analytics/assets', { query });

  it('is a leaderboard by total downloads by default', async () => {
    const app = await adminApp();
    const r = await rows(app);
    expect(r.map((x) => x.assetId)).toEqual(['a-fx-002', 'a-fx-001', 'a-fx-003']);
    expect(r[0]).toEqual({
      assetId: 'a-fx-002',
      title: 'Fixture Item 002',
      ownerDisplayName: 'Kenji Matsuda',
      totalDownloads: 4,
      totalSaves: 2,
      last7dDownloads: 70,
      last30dDownloads: 90,
    });
  });

  it('sorts by saves, last7d and last30d and honours limit', async () => {
    const app = await adminApp();
    expect((await rows(app, { sort: 'saves' })).map((x) => x.assetId)).toEqual([
      'a-fx-003',
      'a-fx-002',
      'a-fx-001',
    ]);
    expect((await rows(app, { sort: 'last7d' })).map((x) => x.assetId)).toEqual([
      'a-fx-002',
      'a-fx-001',
      'a-fx-003',
    ]);
    expect((await rows(app, { sort: 'last30d', limit: 1 })).map((x) => x.assetId)).toEqual([
      'a-fx-001',
    ]);
  });
});

describe('GET /admin/analytics/users', () => {
  it('ranks owners of published assets by their downloads', async () => {
    const app = await adminApp({
      assets: [fixtureAsset('a-mine', { ownerId: FX_PERSONA, totalDownloads: 50 })],
    });
    const r = await app.call<Array<Record<string, unknown>>>('GET', '/admin/analytics/users');
    expect(r).toEqual([
      {
        ownerId: FX_PERSONA,
        displayName: 'Aria Wijaya',
        email: 'aria@example.test',
        publishedAssets: 1,
        totalDownloads: 50,
      },
      {
        ownerId: FX_OTHER,
        displayName: 'Kenji Matsuda',
        email: 'kenji@example.test',
        publishedAssets: 3,
        totalDownloads: 7,
      },
    ]);
  });
});

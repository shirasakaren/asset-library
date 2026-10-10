import { describe, it, expect } from 'vitest';
import type { DashboardResponse } from '@/lib/api/admin-types';
import { fixtureAsset, fixtureUsers } from '@/preview/test-utils';
import type {
  AnalyticsRecord,
  AssetAnalyticsRecord,
  PlatformAnalyticsRecord,
  ReportRecord,
  RequestRecord,
  UserRecord,
} from '@/preview/records';
import { recordDownloads } from '@/preview/handlers/analytics';
import {
  adminApp,
  BUCKETS,
  FX_OTHER,
  fixtureAnalytics,
  PLATFORM_DOWNLOADS,
  PLATFORM_LAST30,
  patchAsset,
  published,
  SEED_END,
  REBASED_TODAY,
  status,
  uploadedFile,
  withUploadedFile,
} from './admin-fixtures';

const dash = (app: Awaited<ReturnType<typeof adminApp>>) =>
  app.call<DashboardResponse>('GET', '/admin/dashboard');

const report = (id: string, s: ReportRecord['status']): ReportRecord => ({
  id,
  category: 'BROKEN_ASSET',
  notes: 'broken',
  status: s,
  assetId: 'a-fx-001',
  reporterId: FX_OTHER,
  adminNotes: null,
  action: null,
  resolvedById: null,
  createdAt: '2026-05-01T00:00:00.000Z',
  resolvedAt: null,
});

const request = (id: string, s: RequestRecord['status']): RequestRecord => ({
  id,
  assetLink: 'https://store.example.test/x',
  assetType: '3D',
  intendedUse: 'testing the dashboard counts',
  price: null,
  notes: null,
  status: s,
  adminComment: null,
  createdAt: '2026-05-01T00:00:00.000Z',
  updatedAt: '2026-05-01T00:00:00.000Z',
  requesterId: FX_OTHER,
  reviewedById: null,
});

describe('GET /admin/dashboard counts', () => {
  it('counts users and assets by status from the current data (DELETED excluded)', async () => {
    const app = await adminApp({
      assets: [
        fixtureAsset('a-d1', { status: 'DRAFT' }),
        fixtureAsset('a-d2', { status: 'DRAFT' }),
        fixtureAsset('a-ar', { status: 'ARCHIVED' }),
        fixtureAsset('a-del', { status: 'DELETED' }),
      ],
    });
    const { counts } = await dash(app);
    expect(counts).toMatchObject({
      users: 3,
      publishedAssets: 3,
      draftAssets: 2,
      archivedAssets: 1,
    });
  });

  it('changes when the data changes (publish an asset, archive another)', async () => {
    const app = await adminApp();
    expect((await dash(app)).counts.publishedAssets).toBe(3);
    await app.db.put('assets', published('a-new', '2026-06-10T10:00:00.000Z'));
    await patchAsset(app, 'a-fx-001', { status: 'ARCHIVED' });
    const { counts } = await dash(app);
    expect(counts.publishedAssets).toBe(3);
    expect(counts.archivedAssets).toBe(1);
  });

  it('downloads30d is the sum of the 30 days before today plus today (rebased seed: the stored last 30)', async () => {
    const app = await adminApp({ now: REBASED_TODAY });
    expect((await dash(app)).counts.downloads30d).toBe(PLATFORM_LAST30);
  });

  it('pending reports are OPEN or REVIEWING, pending requests SENT, IN_REVIEW or PENDING', async () => {
    const app = await adminApp(
      {},
      {
        reports: [
          report('r1', 'OPEN'),
          report('r2', 'REVIEWING'),
          report('r3', 'ACTIONED'),
          report('r4', 'DISMISSED'),
        ],
        requests: [
          request('q1', 'SENT'),
          request('q2', 'IN_REVIEW'),
          request('q3', 'PENDING'),
          request('q4', 'APPROVED'),
          request('q5', 'REJECTED'),
        ],
      },
    );
    const { counts } = await dash(app);
    expect(counts.pendingReports).toBe(2);
    expect(counts.pendingRequests).toBe(3);
  });

  it('avInfected counts INFECTED versions not yet acknowledged, on live assets', async () => {
    const infected = (id: string, over: Partial<ReturnType<typeof fixtureAsset>> = {}) => {
      const a = fixtureAsset(id, over);
      a.versions[0]!.avStatus = 'INFECTED';
      return a;
    };
    const acked = infected('a-acked');
    acked.versions[0]!.avAcknowledgedAt = '2026-05-02T00:00:00.000Z';
    const app = await adminApp({
      assets: [infected('a-inf'), acked, infected('a-inf-del', { status: 'DELETED' })],
    });
    expect((await dash(app)).counts.avInfected).toBe(1);
  });
});

describe('GET /admin/dashboard storage', () => {
  it('reports the bucket rollups, total and bucket order', async () => {
    const app = await adminApp();
    const { storage } = await dash(app);
    expect(storage.byBucket).toEqual([
      { bucket: 'source', bytes: BUCKETS.source },
      { bucket: 'derived', bytes: BUCKETS.derived },
      { bucket: 'thumbs', bytes: BUCKETS.thumbs },
      { bucket: 'featured', bytes: BUCKETS.featured },
      { bucket: 'editor', bytes: BUCKETS.editor },
    ]);
    expect(storage.totalBytes).toBe(Object.values(BUCKETS).reduce((a, b) => a + b, 0));
  });

  it('adds uploaded bytes to the source bucket and drops deleted assets', async () => {
    const withUpload = withUploadedFile(
      published('a-up', '2026-06-05T00:00:00.000Z'),
      uploadedFile('f-up', 700),
    );
    const app = await adminApp({ assets: [withUpload] });
    expect((await dash(app)).storage.byBucket[0]).toEqual({ bucket: 'source', bytes: 6700 });
    // a-fx-003 is worth 1000 in the rollup; once deleted it leaves the source bucket
    await patchAsset(app, 'a-fx-003', { status: 'DELETED' });
    const after = await dash(app);
    expect(after.storage.byBucket[0]).toEqual({ bucket: 'source', bytes: 5700 });
    expect(after.storage.totalBytes).toBe(5700 + 500 + 200 + 50 + 25);
  });

  describe('after a force delete', () => {
    const forceDelete = (app: Awaited<ReturnType<typeof adminApp>>, id: string) =>
      app.call('POST', `/admin/assets/${id}/force-delete`, {
        body: {
          reason: 'Legal takedown',
          confirm: 'I understand',
          confirmedAt: '2026-06-10T11:59:50.000Z',
        },
      });
    const source = async (app: Awaited<ReturnType<typeof adminApp>>) =>
      (await dash(app)).storage.byBucket[0]!.bytes;

    it('a live asset leaves the source bucket once (its seeded 1000 bytes)', async () => {
      const app = await adminApp();
      expect(await source(app)).toBe(6000);
      await forceDelete(app, 'a-fx-003');
      expect(await source(app)).toBe(5000);
      expect((await dash(app)).storage.totalBytes).toBe(5000 + 500 + 200 + 50 + 25);
    });

    it('a soft-deleted asset that is force-deleted afterwards does not add its bytes back', async () => {
      const app = await adminApp();
      await app.call('DELETE', '/admin/assets/a-fx-003', { body: { reason: 'Takedown request' } });
      expect(await source(app)).toBe(5000);
      await forceDelete(app, 'a-fx-003');
      expect(await source(app)).toBe(5000);
    });

    it('an asset created in the browser and force-deleted leaves nothing behind', async () => {
      const mine = withUploadedFile(
        published('a-up', '2026-06-05T00:00:00.000Z'),
        uploadedFile('f-up', 700),
      );
      const app = await adminApp({ assets: [mine] });
      expect(await source(app)).toBe(6700);
      await forceDelete(app, 'a-up');
      expect(await source(app)).toBe(6000);
    });

    it('keeps the asset out of the per-asset and per-user lists', async () => {
      const app = await adminApp();
      await forceDelete(app, 'a-fx-001');
      const rows = await app.call<Array<{ assetId: string }>>('GET', '/admin/storage/assets');
      expect(rows.map((r) => r.assetId)).toEqual(['a-fx-002', 'a-fx-003']);
      const users = await app.call<Array<{ bytes: number }>>('GET', '/admin/storage/users');
      expect(users[0]!.bytes).toBe(3000);
    });
  });

  it('is all zeros without rollups', async () => {
    const app = await adminApp({}, { storage: [] });
    const { storage } = await dash(app);
    expect(storage.totalBytes).toBe(0);
    expect(storage.byBucket.every((b) => b.bytes === 0)).toBe(true);
  });
});

describe('GET /admin/dashboard charts: the 30-day window', () => {
  const dateOf = (s: { date: string }) => s.date;

  it('ends today: the seeded series (rebased, ending yesterday) fill the first 29 days', async () => {
    const app = await adminApp({ now: REBASED_TODAY });
    const { charts } = await dash(app);
    expect(charts.downloads30d).toHaveLength(30);
    expect(charts.downloads30d[0]!.date).toBe('2026-05-03');
    expect(charts.downloads30d[29]!.date).toBe('2026-06-01');
    // the same 30 days in all three series
    expect(charts.publishes30d.map(dateOf)).toEqual(charts.downloads30d.map(dateOf));
    expect(charts.newUsers30d.map(dateOf)).toEqual(charts.downloads30d.map(dateOf));
    expect(charts.downloads30d.map((p) => p.count)).toEqual([...PLATFORM_DOWNLOADS.slice(-29), 0]);
  });

  it('follows the clock: seeded days stay while they are inside the window', async () => {
    const app = await adminApp({ now: '2026-06-10T12:00:00.000Z' });
    const { charts } = await dash(app);
    expect(charts.downloads30d[29]!.date).toBe('2026-06-10');
    expect(charts.downloads30d.find((p) => p.date === SEED_END)!.count).toBe(89);
    expect(charts.downloads30d.find((p) => p.date === '2026-06-05')!.count).toBe(0);
  });

  it('is capped at the clock when it stands before the seeded series end', async () => {
    const app = await adminApp({ now: '2026-05-20T08:00:00.000Z' });
    const { charts } = await dash(app);
    expect(charts.downloads30d[29]!.date).toBe('2026-05-20');
    expect(charts.downloads30d[0]!.date).toBe('2026-04-21');
    expect(charts.downloads30d[29]!.count).toBe(PLATFORM_DOWNLOADS[89 - 11]);
  });

  it('a visitor-created event (publish) lands on today and merges with the seeded days', async () => {
    const app = await adminApp({ now: '2026-06-10T12:00:00.000Z' });
    await app.db.put('assets', published('a-new', '2026-06-10T10:00:00.000Z'));
    const { charts } = await dash(app);
    expect(charts.publishes30d[29]).toEqual({ date: '2026-06-10', count: 1 });
    expect(charts.downloads30d[0]!.date).toBe('2026-05-12');
    // seeded days still inside the window keep their values; the days after the seed are 0
    expect(charts.downloads30d.find((p) => p.date === '2026-05-31')!.count).toBe(89);
    expect(charts.downloads30d.find((p) => p.date === '2026-06-05')!.count).toBe(0);
    expect(charts.downloads30d.find((p) => p.date === '2026-05-12')!.count).toBe(70);
  });

  it('seeded data falls out of the window when the clock is more than 30 days past it', async () => {
    const app = await adminApp({ now: '2027-01-05T09:00:00.000Z' });
    await app.db.put('assets', published('a-late', '2027-01-05T08:00:00.000Z'));
    const { charts, counts } = await dash(app);
    expect(charts.publishes30d[29]).toEqual({ date: '2027-01-05', count: 1 });
    expect(charts.downloads30d[0]!.date).toBe('2026-12-07');
    expect(charts.downloads30d.every((p) => p.count === 0)).toBe(true);
    expect(counts.downloads30d).toBe(0);
  });

  it('counts publishes by publishedAt day for PUBLISHED assets only', async () => {
    const app = await adminApp({
      assets: [
        published('a-p1', '2026-05-20T10:00:00.000Z'),
        published('a-p2', '2026-05-25T01:00:00.000Z'),
        published('a-p3', '2026-05-25T23:00:00.000Z'),
        published('a-p4', '2026-05-26T00:00:00.000Z', { status: 'ARCHIVED' }),
        published('a-old', '2026-04-01T00:00:00.000Z'),
      ],
    });
    const { charts } = await dash(app);
    const by = Object.fromEntries(charts.publishes30d.map((p) => [p.date, p.count]));
    expect(by['2026-05-20']).toBe(1);
    expect(by['2026-05-25']).toBe(2);
    expect(by['2026-05-26']).toBe(0);
    expect(Object.values(by).reduce((a, b) => a + b, 0)).toBe(3);
  });

  it('counts new users by createdAt day', async () => {
    const extra: UserRecord = {
      ...fixtureUsers()[1]!,
      id: 'u-new1',
      email: 'n1@example.test',
      createdAt: '2026-05-28T10:00:00.000Z',
    };
    const app = await adminApp(
      {},
      { users: [...fixtureUsers(), extra, { ...extra, id: 'u-new2', email: 'n2@example.test' }] },
    );
    const { charts } = await dash(app);
    expect(charts.newUsers30d.find((p) => p.date === '2026-05-28')!.count).toBe(2);
    expect(charts.newUsers30d.reduce((a, p) => a + p.count, 0)).toBe(2);
  });

  it('a visitor download today shows up in the chart and in downloads30d', async () => {
    const app = await adminApp({ now: '2026-06-10T12:00:00.000Z' });
    const asset = (await app.db.get('assets', 'a-fx-001')) as ReturnType<typeof fixtureAsset>;
    const version = asset.versions[0]!;
    await recordDownloads(app.ctx, { asset, version, files: version.files, source: 'WEB' });
    const { charts, counts } = await dash(app);
    expect(charts.downloads30d[29]).toEqual({ date: '2026-06-10', count: 1 });
    // rolling 30 days = 05-11..06-10: 21 seeded days + today
    expect(counts.downloads30d).toBe(PLATFORM_DOWNLOADS.slice(-21).reduce((a, b) => a + b, 0) + 1);
    const platform = (await app.db.get('analytics', 'an-platform')) as PlatformAnalyticsRecord;
    expect(platform.endDate).toBe('2026-06-10');
    expect(platform.downloads).toHaveLength(100);
  });
});

describe('platform series bump (recordDownloads)', () => {
  const download = async (app: Awaited<ReturnType<typeof adminApp>>, n = 1) => {
    const asset = (await app.db.get('assets', 'a-fx-001')) as ReturnType<typeof fixtureAsset>;
    const version = asset.versions[0]!;
    for (let i = 0; i < n; i += 1) {
      await recordDownloads(app.ctx, { asset, version, files: version.files, source: 'WEB' });
    }
  };

  it('creates the platform record when the seed has none', async () => {
    const app = await adminApp({}, { analytics: [] });
    await download(app, 2);
    const { charts, counts } = await dash(app);
    expect(charts.downloads30d[29]).toEqual({ date: '2026-06-10', count: 2 });
    expect(counts.downloads30d).toBe(2);
  });

  it('keeps adding to today and pads the days a later download skipped', async () => {
    const app = await adminApp();
    await download(app, 3);
    const later = new Date('2026-06-12T08:00:00.000Z');
    app.ctx.now = () => new Date(later);
    await download(app, 1);
    const platform = (await app.db.get('analytics', 'an-platform')) as PlatformAnalyticsRecord;
    expect(platform.endDate).toBe('2026-06-12');
    expect(platform.downloads.slice(-3)).toEqual([3, 0, 1]);
  });
});

describe('GET /admin/dashboard topAssets7d and recentAudit', () => {
  it('ranks published assets by downloads7d, with owner and saves, skipping zero and unpublished', async () => {
    const records: AnalyticsRecord[] = [
      ...fixtureAnalytics(),
      {
        id: 'an-a-arch',
        kind: 'asset',
        assetId: 'a-arch',
        endDate: SEED_END,
        downloads7d: 999,
        downloads30d: 999,
        detail: null,
      } satisfies AssetAnalyticsRecord,
    ];
    const app = await adminApp(
      { assets: [fixtureAsset('a-arch', { status: 'ARCHIVED' })] },
      { analytics: records },
    );
    const { topAssets7d } = await dash(app);
    expect(topAssets7d.map((a) => a.id)).toEqual(['a-fx-002', 'a-fx-001']);
    expect(topAssets7d[0]).toEqual({
      id: 'a-fx-002',
      slug: 'fx-002',
      title: 'Fixture Item 002',
      ownerDisplayName: 'Kenji Matsuda',
      downloads: 70,
      saves: 2,
    });
  });

  it('returns the 10 newest audit rows with actor names (null actor = system)', async () => {
    const app = await adminApp();
    const { recentAudit } = await dash(app);
    expect(recentAudit.map((a) => a.id)).toEqual(
      Array.from({ length: 10 }, (_, i) => `au-${String(12 - i).padStart(3, '0')}`),
    );
    const byActor = Object.fromEntries(recentAudit.map((a) => [a.id, a]));
    // i = 11 -> id au-012: i % 5 = 1, i odd -> u-other
    expect(byActor['au-012']).toMatchObject({
      actorId: FX_OTHER,
      actorDisplayName: 'Kenji Matsuda',
      actorEmail: 'kenji@example.test',
    });
    // au-010 is index 9: 9 % 5 = 4 -> system job
    expect(byActor['au-010']).toMatchObject({
      actorId: null,
      actorDisplayName: null,
      actorEmail: null,
    });
    expect(Object.keys(recentAudit[0]!).sort()).toEqual(
      [
        'action',
        'actorDisplayName',
        'actorEmail',
        'actorId',
        'createdAt',
        'id',
        'metadata',
        'subjectId',
        'subjectType',
      ].sort(),
    );
  });

  it('is admin-only', async () => {
    const app = await adminApp({ meId: FX_OTHER });
    await expect(dash(app)).rejects.toSatisfy(status(403, 'auth.forbidden'));
  });
});

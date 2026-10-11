import { describe, expect, it } from 'vitest';
import type { AssetAnalyticsDetail, AssetAnalyticsSummary } from '@/lib/api/types';
import type { AnalyticsRecord, AssetAnalyticsRecord, AssetRecord } from '@/preview/records';
import { createSeededTestApp } from '@/preview/test-utils';
import { appForWrites, status, storedOrThrow } from './publish-fixtures';

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const values = (o: Record<string, number>) => Object.values(o);

const detailOf = (app: { call: <T>(m: string, p: string) => Promise<T> }, id: string) =>
  app.call<AssetAnalyticsDetail>('GET', `/me/analytics/assets/${id}`);

describe('GET /me/analytics/assets/{assetId} (real seed)', () => {
  it('maps the stored series for a persona asset: shape, dates and sums', async () => {
    const app = await createSeededTestApp({ timers: false });
    const records = (await app.db.list<AnalyticsRecord>('analytics')).filter(
      (r): r is AssetAnalyticsRecord => r.kind === 'asset' && r.detail !== null,
    );
    expect(records.length).toBeGreaterThan(5);
    for (const rec of records.slice(0, 4)) {
      const asset = (await app.db.get<AssetRecord>('assets', rec.assetId))!;
      const res = await detailOf(app, rec.assetId);
      expect(res.asset).toEqual({ id: asset.id, title: asset.title });
      expect(res.daily).toHaveLength(rec.detail!.daily.length);
      expect(res.daily[res.daily.length - 1]).toEqual({
        date: rec.endDate,
        count: rec.detail!.daily[rec.detail!.daily.length - 1],
      });
      const dates = res.daily.map((d) => d.date);
      expect([...dates].sort()).toEqual(dates);
      expect(new Set(dates).size).toBe(dates.length);
      const total = sum(res.daily.map((d) => d.count));
      expect(total).toBe(sum(rec.detail!.daily));
      expect(sum(values(res.byCountry))).toBe(total);
      expect(sum(values(res.bySource))).toBe(total);
      expect(sum(res.byVersion.map((v) => v.downloads))).toBe(total);
      expect(sum(res.byFile.map((f) => f.downloads))).toBe(total);
      expect(res.byCountry).toEqual(rec.detail!.byCountry);
      for (const row of res.byVersion) {
        expect(asset.versions.find((v) => v.id === row.versionId)?.semver).toBe(row.semver);
      }
      for (const row of res.byFile) {
        const names = asset.versions.flatMap((v) => v.files).find((f) => f.id === row.fileId);
        expect(names?.relativePath).toBe(row.relativePath);
      }
      expect(res.byVersion.map((v) => v.downloads)).toEqual(
        [...res.byVersion.map((v) => v.downloads)].sort((a, b) => b - a),
      );
    }
  });

  it('a seeded persona draft answers with zeros (rows for each version and file)', async () => {
    const app = await createSeededTestApp({ timers: false });
    app.ctx.now = () => new Date('2026-10-10T12:00:00.000Z');
    const res = await detailOf(app, 'a-window-glass-shader');
    const asset = (await app.db.get<AssetRecord>('assets', 'a-window-glass-shader'))!;
    expect(res.asset.title).toBe(asset.title);
    expect(res.daily).toHaveLength(90);
    expect(res.daily[89]).toEqual({ date: '2026-10-10', count: 0 });
    expect(res.daily[0]).toEqual({ date: '2026-07-13', count: 0 });
    expect(res.daily.every((d) => d.count === 0)).toBe(true);
    expect(res.byCountry).toEqual({});
    expect(res.bySource).toEqual({});
    expect(res.byVersion).toEqual(
      asset.versions.map((v) => ({ versionId: v.id, semver: v.semver, downloads: 0 })),
    );
    expect(res.byFile).toEqual(
      asset.versions.flatMap((v) =>
        v.files.map((f) => ({ fileId: f.id, relativePath: f.relativePath, downloads: 0 })),
      ),
    );
  });

  it('an admin gets an empty detail for someone else’s published asset', async () => {
    const app = await createSeededTestApp({ timers: false });
    const other = (await app.db.list<AssetRecord>('assets')).find(
      (a) => a.status === 'PUBLISHED' && a.ownerId !== 'u-persona',
    )!;
    const res = await detailOf(app, other.id);
    expect(res.asset.id).toBe(other.id);
    expect(res.daily.every((d) => d.count === 0)).toBe(true);
  });

  it('404s for an unknown asset', async () => {
    const app = await createSeededTestApp({ timers: false });
    await expect(detailOf(app, 'a-nope')).rejects.toSatisfy(status(404, 'asset.not_found'));
  });
});

describe('GET /me/analytics/assets/{assetId} (rules)', () => {
  it('a non-admin may only read their own assets: 403 for published, 404 for drafts', async () => {
    const app = await appForWrites({ timers: false, meId: 'u-third' });
    await expect(detailOf(app, 'a-fx-001')).rejects.toSatisfy(status(403, 'auth.forbidden'));
    await expect(detailOf(app, 'a-other-draft')).rejects.toSatisfy(status(404));
  });

  it('a deleted asset is a 404', async () => {
    const app = await appForWrites({ timers: false });
    await expect(detailOf(app, 'a-gone')).rejects.toSatisfy(status(404));
  });

  it('reflects downloads made in this session (record created on the first one)', async () => {
    const app = await appForWrites({ timers: false });
    app.ctx.now = () => new Date('2026-04-02T10:00:00.000Z');
    const a = await storedOrThrow(app, 'a-mine-pub');
    const v = a.versions[0]!;
    await app.call('POST', '/downloads', {
      body: { assetId: a.id, versionId: v.id, fileId: v.files[0]!.id, source: 'WEB' },
    });
    const res = await detailOf(app, a.id);
    expect(res.daily[89]).toEqual({ date: '2026-04-02', count: 1 });
    expect(res.bySource).toEqual({ WEB: 1 });
    expect(res.byCountry).toEqual({ unknown: 1 });
    expect(res.byVersion).toEqual([{ versionId: v.id, semver: '1.0.0', downloads: 1 }]);
    expect(res.byFile).toEqual([
      { fileId: v.files[0]!.id, relativePath: v.files[0]!.relativePath, downloads: 1 },
    ]);
  });
});

describe('GET /me/analytics/summary', () => {
  it('sums the persona’s published and archived assets from the stored series (real seed)', async () => {
    const app = await createSeededTestApp({ timers: false });
    const mine = (await app.db.list<AssetRecord>('assets')).filter(
      (a) => a.ownerId === 'u-persona' && (a.status === 'PUBLISHED' || a.status === 'ARCHIVED'),
    );
    const records = (await app.db.list<AnalyticsRecord>('analytics')).filter(
      (r): r is AssetAnalyticsRecord =>
        r.kind === 'asset' && r.detail !== null && mine.some((a) => a.id === r.assetId),
    );
    const res = await app.call<AssetAnalyticsSummary>('GET', '/me/analytics/summary');

    expect(res.totals.downloads).toBe(sum(mine.map((a) => a.totalDownloads)));
    expect(res.totals.saves).toBe(sum(mine.map((a) => a.totalSaves)));
    expect(res.totals.downloads7d).toBe(sum(records.map((r) => sum(r.detail!.daily.slice(-7)))));
    expect(res.totals.downloads30d).toBe(sum(records.map((r) => sum(r.detail!.daily.slice(-30)))));

    expect(res.topAssets.length).toBeLessThanOrEqual(5);
    expect(res.topAssets.length).toBeGreaterThan(0);
    const downloads = res.topAssets.map((t) => t.downloads);
    expect(downloads).toEqual([...downloads].sort((a, b) => b - a));
    expect(downloads[0]).toBe(Math.max(...mine.map((a) => a.totalDownloads)));
    for (const t of res.topAssets) {
      const a = mine.find((x) => x.id === t.id)!;
      expect(t).toEqual({
        id: a.id,
        title: a.title,
        downloads: a.totalDownloads,
        saves: a.totalSaves,
      });
    }

    expect(res.daily90d).toHaveLength(90);
    expect(res.daily90d[89]!.date).toBe('2026-09-30');
    const dates = res.daily90d.map((d) => d.date);
    expect([...dates].sort()).toEqual(dates);
    expect(sum(res.daily90d.map((d) => d.count))).toBe(
      sum(records.map((r) => sum(r.detail!.daily))),
    );
    // per-day sum over assets
    const last = sum(records.map((r) => r.detail!.daily[r.detail!.daily.length - 1]!));
    expect(res.daily90d[89]!.count).toBe(last);
  });

  it('is all zeros when the persona owns nothing published', async () => {
    const app = await appForWrites({ timers: false, meId: 'u-third' });
    expect(await app.call('GET', '/me/analytics/summary')).toEqual({
      totals: { downloads: 0, saves: 0, downloads7d: 0, downloads30d: 0 },
      topAssets: [],
      daily90d: [],
    });
  });

  it('counts an asset without a series by its stored totals only', async () => {
    const app = await appForWrites({ timers: false });
    await app.db.patch<AssetRecord>('assets', 'a-mine-pub', { totalDownloads: 7, totalSaves: 2 });
    const res = await app.call<AssetAnalyticsSummary>('GET', '/me/analytics/summary');
    expect(res.totals).toEqual({ downloads: 7, saves: 2, downloads7d: 0, downloads30d: 0 });
    expect(res.topAssets).toEqual([
      { id: 'a-mine-pub', title: 'Mine Published', downloads: 7, saves: 2 },
    ]);
    expect(res.daily90d).toEqual([]);
  });
});

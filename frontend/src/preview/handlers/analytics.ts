import type { AssetAnalyticsDetail, AssetAnalyticsSummary, DownloadSource } from '@/lib/api/types';
import type {
  AnalyticsRecord,
  AssetAnalyticsDetailRecord,
  AssetAnalyticsRecord,
  AssetFileRecord,
  AssetRecord,
  AssetVersionRecord,
  PlatformAnalyticsRecord,
} from '../records';
import { route, type PreviewContext } from '../router/router';
import { loadWritable } from './asset-write-core';

/**
 * Owner analytics, built from the seeded `AnalyticsRecord`s (see `records.ts`) and kept current
 * by `recordDownloads`, which `POST /downloads` calls.
 *
 * Series dates are never stored: a record has `endDate` and its arrays END on it. An asset with
 * no record (a draft, an archived asset, anything created in the browser) answers with zeros:
 * 90 days ending today (`ctx.now()`).
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 90;
const MAX_GAP_DAYS = 3660;

const dayOf = (d: Date): string => d.toISOString().slice(0, 10);
const dayNumber = (date: string): number => Math.floor(Date.parse(`${date}T00:00:00Z`) / DAY_MS);
const dateFromNumber = (n: number): string => new Date(n * DAY_MS).toISOString().slice(0, 10);

/** `{ date, count }` for a series that ends on `endDate`. */
function toPoints(daily: number[], endDate: string): { date: string; count: number }[] {
  const end = dayNumber(endDate);
  return daily.map((count, i) => ({ date: dateFromNumber(end - (daily.length - 1 - i)), count }));
}

const assetRecordId = (assetId: string) => `an-${assetId}`;

const getAssetRecord = (ctx: PreviewContext, assetId: string) =>
  ctx.db.get<AnalyticsRecord>('analytics', assetRecordId(assetId)) as Promise<
    AssetAnalyticsRecord | undefined
  >;

const sumLast = (daily: number[], n: number) => daily.slice(-n).reduce((a, b) => a + b, 0);

/* -------------------------------------------------------------------------- *
 * Reading
 * -------------------------------------------------------------------------- */

const byDownloadsDesc = <T extends { downloads: number }>(rows: T[], tie: (r: T) => string) =>
  rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => b.r.downloads - a.r.downloads || tie(a.r).localeCompare(tie(b.r)) || a.i - b.i)
    .map((x) => x.r);

/** `GET /me/analytics/assets/{assetId}`: owner or admin. */
export function buildDetail(
  asset: AssetRecord,
  record: AssetAnalyticsRecord | undefined,
  today: string,
): AssetAnalyticsDetail {
  const detail = record?.detail ?? null;
  const versionDownloads = new Map(
    (detail?.byVersion ?? []).map((v) => [v.versionId, v.downloads]),
  );
  const fileDownloads = new Map((detail?.byFile ?? []).map((f) => [f.fileId, f.downloads]));
  return {
    asset: { id: asset.id, title: asset.title },
    daily: detail
      ? toPoints(detail.daily, record!.endDate)
      : toPoints(new Array<number>(WINDOW_DAYS).fill(0), today),
    byCountry: { ...(detail?.byCountry ?? {}) },
    bySource: { ...(detail?.bySource ?? {}) },
    // Like the backend (LEFT JOIN): every version and file that exists, 0 when nobody got it.
    byVersion: byDownloadsDesc(
      asset.versions.map((v) => ({
        versionId: v.id,
        semver: v.semver,
        downloads: versionDownloads.get(v.id) ?? 0,
      })),
      (r) => r.semver,
    ),
    byFile: byDownloadsDesc(
      asset.versions.flatMap((v) =>
        v.files.map((f) => ({
          fileId: f.id,
          relativePath: f.relativePath,
          downloads: fileDownloads.get(f.id) ?? 0,
        })),
      ),
      (r) => r.relativePath,
    ).slice(0, 50),
  };
}

route('GET', '/me/analytics/assets/{assetId}', async (req, ctx): Promise<AssetAnalyticsDetail> => {
  // Unknown / deleted / someone else's draft: 404. Visible but neither owner nor admin: 403.
  const { asset } = await loadWritable(ctx, req.params.assetId!);
  return buildDetail(asset, await getAssetRecord(ctx, asset.id), dayOf(ctx.now()));
});

/**
 * `GET /me/analytics/summary`: the persona's PUBLISHED and ARCHIVED assets (as in the backend).
 * Download totals use the stored counters; the 7 / 30 day figures and the daily series come from
 * each asset's detail series (the last 7 / 30 values, and the per-date sum, newest 90 dates).
 */
route('GET', '/me/analytics/summary', async (_req, ctx): Promise<AssetAnalyticsSummary> => {
  const owned = (await ctx.db.list<AssetRecord>('assets')).filter(
    (a) => a.ownerId === ctx.meId && (a.status === 'PUBLISHED' || a.status === 'ARCHIVED'),
  );
  const out: AssetAnalyticsSummary = {
    totals: { downloads: 0, saves: 0, downloads7d: 0, downloads30d: 0 },
    topAssets: [],
    daily90d: [],
  };
  if (owned.length === 0) return out;

  const perDate = new Map<string, number>();
  for (const asset of owned) {
    out.totals.downloads += asset.totalDownloads;
    out.totals.saves += asset.totalSaves;
    const rec = await getAssetRecord(ctx, asset.id);
    if (!rec?.detail) continue;
    out.totals.downloads7d += sumLast(rec.detail.daily, 7);
    out.totals.downloads30d += sumLast(rec.detail.daily, 30);
    for (const p of toPoints(rec.detail.daily, rec.endDate)) {
      perDate.set(p.date, (perDate.get(p.date) ?? 0) + p.count);
    }
  }
  out.topAssets = owned
    .map((a) => ({ id: a.id, title: a.title, downloads: a.totalDownloads, saves: a.totalSaves }))
    .sort((a, b) => b.downloads - a.downloads || a.id.localeCompare(b.id))
    .slice(0, 5);
  out.daily90d = [...perDate.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .slice(-WINDOW_DAYS)
    .map(([date, count]) => ({ date, count }));
  return out;
});

/* -------------------------------------------------------------------------- *
 * Writing (called by POST /downloads)
 * -------------------------------------------------------------------------- */

const emptyDetail = (today: string): { detail: AssetAnalyticsDetailRecord; endDate: string } => ({
  endDate: today,
  detail: {
    daily: new Array<number>(WINDOW_DAYS).fill(0),
    byCountry: {},
    bySource: {},
    byVersion: [],
    byFile: [],
  },
});

const bump = <T extends { downloads: number }>(
  rows: T[],
  match: (r: T) => boolean,
  make: () => T,
  n: number,
) => {
  const row = rows.find(match);
  if (row) row.downloads += n;
  else rows.push({ ...make(), downloads: n });
};

/** Longest platform series kept (the admin views never ask for more than a year). */
const PLATFORM_KEEP_DAYS = 400;

/**
 * Adds `n` downloads to today's bucket of the platform series (`an-platform`), padding the days
 * since its `endDate` with zeros, so the admin dashboard sees what the visitor downloads. Without
 * a platform record one is created (90 zero days ending today).
 */
export async function bumpPlatformDownloads(ctx: PreviewContext, n: number): Promise<void> {
  const today = dayOf(ctx.now());
  const rec = (await ctx.db.get<AnalyticsRecord>('analytics', 'an-platform')) as
    PlatformAnalyticsRecord | undefined;
  if (!rec) {
    const downloads = new Array<number>(WINDOW_DAYS).fill(0);
    downloads[WINDOW_DAYS - 1] = n;
    await ctx.db.put<AnalyticsRecord>('analytics', {
      id: 'an-platform',
      kind: 'platform',
      endDate: today,
      downloads,
    });
    return;
  }
  const downloads = [...rec.downloads];
  let endDate = rec.endDate;
  const gap = dayNumber(today) - dayNumber(rec.endDate);
  if (gap > 0) {
    downloads.push(...new Array<number>(Math.min(gap, MAX_GAP_DAYS)).fill(0));
    endDate = today;
  }
  const idx = downloads.length - 1 + Math.min(0, gap);
  if (idx >= 0) downloads[idx]! += n;
  await ctx.db.patch<AnalyticsRecord>('analytics', rec.id, {
    endDate,
    downloads: downloads.slice(-PLATFORM_KEEP_DAYS),
  } as Partial<PlatformAnalyticsRecord>);
}

/**
 * Adds the downloads of `files` to the asset's analytics: today's bucket (the series is padded
 * with zero days up to today, so every date stays consistent), the country (`unknown`: nothing
 * to look it up from), the source, the version and each file; `downloads7d`/`30d` of the record
 * too. A record is created for assets of the persona that have none (so the owner sees the
 * numbers of an asset published in the browser); somebody else's asset without a record, and a
 * record without a detail series, only get the counters.
 */
export async function recordDownloads(
  ctx: PreviewContext,
  args: {
    asset: AssetRecord;
    version: AssetVersionRecord;
    files: AssetFileRecord[];
    source: DownloadSource;
  },
): Promise<void> {
  const { asset, version, files, source } = args;
  const n = files.length;
  if (n === 0) return;
  await bumpPlatformDownloads(ctx, n);
  const today = dayOf(ctx.now());
  let rec = await getAssetRecord(ctx, asset.id);
  const isNew = !rec;
  if (!rec) {
    if (asset.ownerId !== ctx.meId) return;
    rec = {
      id: assetRecordId(asset.id),
      kind: 'asset',
      assetId: asset.id,
      downloads7d: 0,
      downloads30d: 0,
      ...emptyDetail(today),
    };
  }
  rec.downloads7d += n;
  rec.downloads30d += n;

  const detail = rec.detail;
  if (detail) {
    const gap = dayNumber(today) - dayNumber(rec.endDate);
    if (gap > 0) {
      detail.daily.push(...new Array<number>(Math.min(gap, MAX_GAP_DAYS)).fill(0));
      rec.endDate = today;
    }
    const idx = detail.daily.length - 1 + Math.min(0, gap);
    if (idx >= 0) detail.daily[idx]! += n;
    detail.byCountry.unknown = (detail.byCountry.unknown ?? 0) + n;
    detail.bySource[source] = (detail.bySource[source] ?? 0) + n;
    bump(
      detail.byVersion,
      (r) => r.versionId === version.id,
      () => ({ versionId: version.id, downloads: 0 }),
      n,
    );
    for (const f of files) {
      bump(
        detail.byFile,
        (r) => r.fileId === f.id,
        () => ({ fileId: f.id, downloads: 0 }),
        1,
      );
    }
  }
  if (isNew) await ctx.db.put<AnalyticsRecord>('analytics', rec);
  else await ctx.db.patch<AnalyticsRecord>('analytics', rec.id, rec);
}

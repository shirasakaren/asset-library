import type { AnalyticsRecord, AssetAnalyticsRecord, AssetRecord, UserRecord } from '../../records';
import { badRequest } from '../../router/errors';
import { adminRoute, cmpStr, dayFromNumber, dayNumber, dayOf } from './common';
import { CHART_DAYS, chartWindowEnd, loadSeriesData, platformByDay } from './series';

/*
 * `/admin/analytics/*`: no screen calls these (the dashboard has its own payload), so they are a
 * small read-only view of the same records, in the backend's response shapes.
 */

const MAX_RANGE_DAYS = 366;
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 200;

const limitOf = (query: URLSearchParams): number => {
  const n = Number(query.get('limit') ?? DEFAULT_LIMIT);
  return Number.isFinite(n) ? Math.min(Math.max(Math.floor(n), 1), MAX_LIMIT) : DEFAULT_LIMIT;
};

function dayParam(query: URLSearchParams, name: string): string | undefined {
  const raw = (query.get(name) ?? '').trim();
  if (!raw) return undefined;
  const ms = Date.parse(raw);
  if (!/^\d{4}-\d{2}-\d{2}/.test(raw) || Number.isNaN(ms)) {
    throw badRequest(`${name} must be an ISO-8601 date.`, {
      fields: [{ path: name, code: 'invalid', message: `${name} must be an ISO-8601 date.` }],
    });
  }
  return dayOf(new Date(ms));
}

/**
 * Platform series for `from` (inclusive) .. `to` (exclusive), default: the 30 days of the
 * dashboard window. `daily` are the downloads per day (zero-filled); `totals` also count the
 * assets published and the users created in the range. `bySource` is `{}`: the seed only has
 * a per-source split for the persona's own assets, which would misrepresent the platform.
 */
adminRoute('GET', '/admin/analytics/platform', async (req, ctx) => {
  const data = await loadSeriesData(ctx);
  const defaultTo = dayFromNumber(dayNumber(await chartWindowEnd(ctx, data)) + 1);
  const to = dayParam(req.query, 'to') ?? defaultTo;
  const from = dayParam(req.query, 'from') ?? dayFromNumber(dayNumber(to) - CHART_DAYS);
  const span = dayNumber(to) - dayNumber(from);
  if (span <= 0 || span > MAX_RANGE_DAYS) {
    throw badRequest(`The range must be between 1 and ${MAX_RANGE_DAYS} days.`, {
      fields: [{ path: 'from', code: 'range', message: 'from must be before to, at most a year.' }],
    });
  }
  const byDay = platformByDay(data.platform);
  const daily = Array.from({ length: span }, (_, i) => {
    const date = dayFromNumber(dayNumber(from) + i);
    return { date, count: byDay.get(date) ?? 0 };
  });
  const inRange = (iso: string) => {
    const d = dayOf(iso);
    return d >= from && d < to;
  };
  return {
    daily,
    totals: {
      downloads: daily.reduce((s, p) => s + p.count, 0),
      publishes: data.assets.filter((a) => a.publishedAt && inRange(a.publishedAt)).length,
      newUsers: data.users.filter((u) => inRange(u.createdAt)).length,
    },
    bySource: {} as Record<string, number>,
  };
});

type AssetSort = 'downloads' | 'saves' | 'last7d' | 'last30d';

/** Leaderboard of live assets (any status but DELETED); an unknown `sort` means `downloads`. */
adminRoute('GET', '/admin/analytics/assets', async (req, ctx) => {
  const sort = (req.query.get('sort') ?? 'downloads') as AssetSort;
  const [assets, users, analytics] = await Promise.all([
    ctx.db.list<AssetRecord>('assets'),
    ctx.db.list<UserRecord>('users'),
    ctx.db.list<AnalyticsRecord>('analytics'),
  ]);
  const usersById = new Map(users.map((u) => [u.id, u]));
  const records = new Map(
    analytics
      .filter((r): r is AssetAnalyticsRecord => r.kind === 'asset')
      .map((r) => [r.assetId, r]),
  );
  const rows = assets
    .filter((a) => a.status !== 'DELETED')
    .map((a) => ({
      assetId: a.id,
      title: a.title,
      ownerDisplayName: usersById.get(a.ownerId)?.displayName ?? 'Unknown user',
      totalDownloads: a.totalDownloads,
      totalSaves: a.totalSaves,
      last7dDownloads: records.get(a.id)?.downloads7d ?? 0,
      last30dDownloads: records.get(a.id)?.downloads30d ?? 0,
    }));
  const key = {
    saves: 'totalSaves',
    last7d: 'last7dDownloads',
    last30d: 'last30dDownloads',
    downloads: 'totalDownloads',
  } as const;
  const field = key[sort] ?? key.downloads;
  return rows
    .sort((a, b) => b[field] - a[field] || cmpStr(a.assetId, b.assetId))
    .slice(0, limitOf(req.query));
});

/** Leaderboard of owners of PUBLISHED assets: asset count and the downloads of those assets. */
adminRoute('GET', '/admin/analytics/users', async (req, ctx) => {
  const [assets, users] = await Promise.all([
    ctx.db.list<AssetRecord>('assets'),
    ctx.db.list<UserRecord>('users'),
  ]);
  const usersById = new Map(users.map((u) => [u.id, u]));
  const byOwner = new Map<string, { publishedAssets: number; totalDownloads: number }>();
  for (const a of assets) {
    if (a.status !== 'PUBLISHED') continue;
    const row = byOwner.get(a.ownerId) ?? { publishedAssets: 0, totalDownloads: 0 };
    row.publishedAssets += 1;
    row.totalDownloads += a.totalDownloads;
    byOwner.set(a.ownerId, row);
  }
  return [...byOwner.entries()]
    .map(([ownerId, row]) => ({
      ownerId,
      displayName: usersById.get(ownerId)?.displayName,
      email: usersById.get(ownerId)?.email,
      ...row,
    }))
    .sort((a, b) => b.totalDownloads - a.totalDownloads || cmpStr(a.ownerId, b.ownerId))
    .slice(0, limitOf(req.query));
});

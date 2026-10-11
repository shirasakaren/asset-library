import type { DashboardResponse } from '@/lib/api/admin-types';
import type {
  AnalyticsRecord,
  AssetAnalyticsRecord,
  AssetRecord,
  AuditRecord,
  ReportRecord,
  RequestRecord,
  UserRecord,
} from '../../records';
import type { PreviewContext } from '../../router/router';
import { adminRoute, cmpStr } from './common';
import { auditNewestFirst, toAuditEntry } from './audit-view';
import {
  CHART_DAYS,
  chartWindowEnd,
  countByDay,
  daysEndingOn,
  loadSeriesData,
  platformByDay,
  pointsFrom,
} from './series';
import { bucketTotals, loadStorageModel } from './storage-core';

const PENDING_REPORTS: ReadonlyArray<ReportRecord['status']> = ['OPEN', 'REVIEWING'];
const PENDING_REQUESTS: ReadonlyArray<RequestRecord['status']> = ['SENT', 'IN_REVIEW', 'PENDING'];
const TOP_ASSETS = 10;
const RECENT_AUDIT = 10;

/** INFECTED versions nobody has acknowledged yet, on assets that still exist. */
const infectedVersions = (assets: AssetRecord[]): number =>
  assets
    .filter((a) => a.status !== 'DELETED')
    .reduce(
      (n, a) =>
        n + a.versions.filter((v) => v.avStatus === 'INFECTED' && !v.avAcknowledgedAt).length,
      0,
    );

/**
 * `DashboardResponse`, computed from the CURRENT data on every call (no cache): counts, storage
 * rollups, 30-day charts, the top assets and the newest audit rows. The chart window rule is
 * documented on `chartWindowEnd` (series.ts).
 */
export async function buildDashboard(ctx: PreviewContext): Promise<DashboardResponse> {
  const [series, reports, requests, analytics, audit, storage] = await Promise.all([
    loadSeriesData(ctx),
    ctx.db.list<ReportRecord>('reports'),
    ctx.db.list<RequestRecord>('requests'),
    ctx.db.list<AnalyticsRecord>('analytics'),
    ctx.db.list<AuditRecord>('audit'),
    loadStorageModel(ctx),
  ]);
  const { platform, assets, users } = series;

  const end = chartWindowEnd(ctx);
  const days = daysEndingOn(end, CHART_DAYS);
  const platformDays = platformByDay(platform);
  const downloads30d = pointsFrom(days, platformDays);
  // The backend counts downloads since now - 30 days: today and the 30 days before it.
  const rolling30d = pointsFrom(daysEndingOn(end, CHART_DAYS + 1), platformDays);
  const published = assets.filter((a) => a.status === 'PUBLISHED');

  const usersById = new Map<string, UserRecord>(users.map((u) => [u.id, u]));
  const byId = new Map(assets.map((a) => [a.id, a]));
  const topAssets7d = analytics
    .filter((r): r is AssetAnalyticsRecord => r.kind === 'asset' && r.downloads7d > 0)
    .flatMap((r) => {
      const a = byId.get(r.assetId);
      return a && a.status === 'PUBLISHED' ? [{ a, downloads: r.downloads7d }] : [];
    })
    .sort((x, y) => y.downloads - x.downloads || cmpStr(x.a.id, y.a.id))
    .slice(0, TOP_ASSETS)
    .map(({ a, downloads }) => ({
      id: a.id,
      slug: a.slug,
      title: a.title,
      ownerDisplayName: usersById.get(a.ownerId)?.displayName ?? 'Unknown user',
      downloads,
      // No 7-day series behind saves: the stored counter.
      saves: a.totalSaves,
    }));

  return {
    counts: {
      users: users.length,
      publishedAssets: published.length,
      draftAssets: assets.filter((a) => a.status === 'DRAFT').length,
      archivedAssets: assets.filter((a) => a.status === 'ARCHIVED').length,
      downloads30d: rolling30d.reduce((sum, p) => sum + p.count, 0),
      pendingReports: reports.filter((r) => PENDING_REPORTS.includes(r.status)).length,
      pendingRequests: requests.filter((r) => PENDING_REQUESTS.includes(r.status)).length,
      avInfected: infectedVersions(assets),
    },
    storage: bucketTotals(storage),
    charts: {
      downloads30d,
      publishes30d: countByDay(
        days,
        published.flatMap((a) => (a.publishedAt ? [a.publishedAt] : [])),
      ),
      newUsers30d: countByDay(
        days,
        users.map((u) => u.createdAt),
      ),
    },
    topAssets7d,
    recentAudit: [...audit]
      .sort(auditNewestFirst)
      .slice(0, RECENT_AUDIT)
      .map((row) => toAuditEntry(row, usersById)),
  };
}

adminRoute('GET', '/admin/dashboard', (_req, ctx) => buildDashboard(ctx));

import type {
  AnalyticsRecord,
  AssetRecord,
  PlatformAnalyticsRecord,
  UserRecord,
} from '../../records';
import type { PreviewContext } from '../../router/router';
import { dayFromNumber, dayNumber, dayOf } from './common';

/** Days in the dashboard charts. */
export const CHART_DAYS = 30;

export interface DayPoint {
  date: string;
  count: number;
}

export interface SeriesData {
  platform: PlatformAnalyticsRecord | undefined;
  assets: AssetRecord[];
  users: UserRecord[];
}

export async function loadSeriesData(ctx: PreviewContext): Promise<SeriesData> {
  const [analytics, assets, users] = await Promise.all([
    ctx.db.list<AnalyticsRecord>('analytics'),
    ctx.db.list<AssetRecord>('assets'),
    ctx.db.list<UserRecord>('users'),
  ]);
  return {
    platform: analytics.find((a): a is PlatformAnalyticsRecord => a.kind === 'platform'),
    assets,
    users,
  };
}

/**
 * Last day of the dashboard charts: today (`ctx.now()`, UTC). The seed is rebased onto the
 * visitor's clock when the Db loads (`store/rebase.ts`), so its series end yesterday and visitor
 * data carries today's date; no event search is needed and the window never drifts away from the
 * data. The last point (today) only has what the visitor did.
 */
export function chartWindowEnd(ctx: PreviewContext): string {
  return dayOf(ctx.now());
}

/** `n` consecutive days ending on `end`, oldest first. */
export function daysEndingOn(end: string, n: number): string[] {
  const last = dayNumber(end);
  return Array.from({ length: n }, (_, i) => dayFromNumber(last - (n - 1 - i)));
}

/** Platform download counts by date (the record's array ends on its `endDate`). */
export function platformByDay(rec: PlatformAnalyticsRecord | undefined): Map<string, number> {
  const out = new Map<string, number>();
  if (!rec) return out;
  const last = dayNumber(rec.endDate);
  rec.downloads.forEach((count, i) => {
    out.set(dayFromNumber(last - (rec.downloads.length - 1 - i)), count);
  });
  return out;
}

/** One point per day of `days`, counting the ISO timestamps that fall on it. */
export function countByDay(days: string[], timestamps: string[]): DayPoint[] {
  const counts = new Map<string, number>();
  for (const t of timestamps) {
    const d = dayOf(t);
    counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  return days.map((date) => ({ date, count: counts.get(date) ?? 0 }));
}

/** One point per day of `days` from a date -> count map (zero-filled). */
export function pointsFrom(days: string[], byDay: Map<string, number>): DayPoint[] {
  return days.map((date) => ({ date, count: byDay.get(date) ?? 0 }));
}

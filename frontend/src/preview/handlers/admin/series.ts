import type {
  AnalyticsRecord,
  AssetRecord,
  KvRecord,
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

/** The day before the seed anchor (`kv.meta.anchor`), the seed's last complete day. */
async function seedLastDay(ctx: PreviewContext): Promise<string | undefined> {
  const meta = await ctx.db.get<KvRecord>('kv', 'meta');
  const anchor = (meta?.value as { anchor?: unknown } | undefined)?.anchor;
  if (typeof anchor !== 'string' || Number.isNaN(Date.parse(anchor))) return undefined;
  return dayFromNumber(dayNumber(dayOf(anchor)) - 1);
}

/**
 * Last day of the dashboard charts. The seed's series end on a fixed day (the day before the
 * anchor, `2026-09-30`) and do not move with the wall clock, while visitor-made data (a publish,
 * a download) carries the real date. The window therefore ends on the NEWEST event day in the
 * data: the end of the platform series (or anchor - 1 without one), the latest `publishedAt` of
 * a PUBLISHED asset and the latest user `createdAt`; never later than `ctx.now()`.
 *
 *  - Nothing happened since the seed: the window is the seed's last 30 days, whatever the date is
 *    (months later the charts still show the seeded activity, with the exact stored numbers).
 *  - The visitor publishes or downloads today: the window ends today and the seeded days that are
 *    still inside it keep their values, the days between are 0. Seeded data falls out of the
 *    window only when real activity happens more than 30 days after it.
 *  - A clock before the seed's end caps the window at the clock.
 */
export async function chartWindowEnd(ctx: PreviewContext, data: SeriesData): Promise<string> {
  const today = dayOf(ctx.now());
  const days: string[] = [];
  const seedEnd = data.platform?.endDate ?? (await seedLastDay(ctx));
  if (seedEnd) days.push(seedEnd);
  for (const a of data.assets) {
    if (a.status === 'PUBLISHED' && a.publishedAt) days.push(dayOf(a.publishedAt));
  }
  for (const u of data.users) days.push(dayOf(u.createdAt));
  const latest = days.reduce<string | undefined>(
    (m, d) => (m === undefined || d > m ? d : m),
    undefined,
  );
  return latest === undefined || latest > today ? today : latest;
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

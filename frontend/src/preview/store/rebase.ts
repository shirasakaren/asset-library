const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days between the seed anchor and `now` (never negative): the visitor's date offset. */
export function rebaseOffsetDays(anchor: string, now: Date): number {
  const diff = Math.floor((now.getTime() - Date.parse(anchor)) / DAY_MS);
  return Number.isFinite(diff) ? Math.max(0, diff) : 0;
}

const DATETIME = /^(\d{4}-\d{2}-\d{2})(T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)$/;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const pad = (n: number, w: number) => String(n).padStart(w, '0');
const formatDay = (ms: number): string => {
  const d = new Date(ms);
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1, 2)}-${pad(d.getUTCDate(), 2)}`;
};

/** `YYYY-MM-DD` plus whole days in UTC (a real calendar day, so DST never matters); invalid dates stay. */
function shiftDay(day: string, offsetDays: number): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const ms = Date.UTC(y, m - 1, d);
  if (formatDay(ms) !== day) return day; // 2026-13-45 and friends are not dates
  return formatDay(ms + offsetDays * DAY_MS);
}

function shiftString(s: string, offsetDays: number): string {
  const dt = DATETIME.exec(s);
  if (dt) return shiftDay(dt[1]!, offsetDays) + dt[2]!;
  if (DATE_ONLY.test(s)) return shiftDay(s, offsetDays);
  return s;
}

/**
 * The seed's dates are fixed to its anchor (2026-10-01), so they age with the real clock. At load
 * the Db moves them forward by the visitor's offset: every string that is a full UTC ISO datetime
 * (`2026-09-30T17:15:15.000Z`, with or without a fraction) or a bare `YYYY-MM-DD` gets `offsetDays`
 * added, keeping its format and time of day. Nothing else is touched (ids, semvers, sentences
 * that contain a date, object keys). Pure: returns a new structure, the input is not mutated.
 */
export function shiftSeedValue<T>(value: T, offsetDays: number): T {
  if (offsetDays === 0) return value;
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return shiftString(v, offsetDays);
    if (Array.isArray(v)) return v.map(walk);
    if (v !== null && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v)) out[k] = walk(x);
      return out;
    }
    return v;
  };
  return walk(value) as T;
}

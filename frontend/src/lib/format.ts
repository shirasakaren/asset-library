import type { Locale } from './env.public';

export function formatDate(
  value: string | number | Date,
  locale: Locale = 'en',
  style: Intl.DateTimeFormatOptions = { dateStyle: 'medium' },
): string {
  return new Intl.DateTimeFormat(locale === 'id' ? 'id-ID' : 'en-US', style).format(
    typeof value === 'string' || typeof value === 'number' ? new Date(value) : value,
  );
}

export function formatBytes(bytes: number | bigint | string, locale: Locale = 'en'): string {
  const n = typeof bytes === 'string' ? Number(bytes) : Number(bytes);
  if (!Number.isFinite(n) || n < 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = n;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${new Intl.NumberFormat(locale === 'id' ? 'id-ID' : 'en-US', {
    maximumFractionDigits: value < 10 ? 1 : 0,
  }).format(value)} ${units[unit]}`;
}

export function formatNumber(value: number, locale: Locale = 'en'): string {
  return new Intl.NumberFormat(locale === 'id' ? 'id-ID' : 'en-US').format(value);
}

const RELATIVE_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 60 * 60 * 24 * 365],
  ['month', 60 * 60 * 24 * 30],
  ['week', 60 * 60 * 24 * 7],
  ['day', 60 * 60 * 24],
  ['hour', 60 * 60],
  ['minute', 60],
  ['second', 1],
];

export function formatRelative(value: string | number | Date, locale: Locale = 'en'): string {
  const then = typeof value === 'string' || typeof value === 'number' ? new Date(value) : value;
  const diffSeconds = Math.round((then.getTime() - Date.now()) / 1000);
  const absSeconds = Math.abs(diffSeconds);
  const rtf = new Intl.RelativeTimeFormat(locale === 'id' ? 'id-ID' : 'en-US', { numeric: 'auto' });
  for (const [unit, secs] of RELATIVE_UNITS) {
    if (absSeconds >= secs || unit === 'second') {
      return rtf.format(Math.round(diffSeconds / secs), unit);
    }
  }
  return rtf.format(diffSeconds, 'second');
}

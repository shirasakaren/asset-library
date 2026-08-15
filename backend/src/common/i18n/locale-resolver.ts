import { Locale } from '@prisma/client';

/**
 * Shape of a multilingual JSON column (`{ en, id }`).
 */
export type LocalizedJson<T = string> = Partial<Record<Locale, T>>;

/**
 * Resolves a localized value with the documented fallback rule:
 *   1. requested locale, if present
 *   2. otherwise, whichever locale was created first (we iterate the keys in
 *      the order they were serialized — Postgres preserves insertion order for
 *      json columns).
 */
export function resolveLocalized<T>(
  value: LocalizedJson<T> | null | undefined,
  locale: Locale,
): T | null {
  if (!value) return null;
  if (value[locale] != null) return value[locale] as T;
  for (const key of Object.keys(value) as Locale[]) {
    if (value[key] != null) return value[key] as T;
  }
  return null;
}

/**
 * Resolves one of N `{ locale, value }` rows (e.g. AssetTranslation). Returns
 * the row matching `locale`, otherwise the first available row.
 */
export function pickTranslation<T extends { locale: Locale }>(rows: T[], locale: Locale): T | null {
  if (rows.length === 0) return null;
  return rows.find((r) => r.locale === locale) ?? rows[0] ?? null;
}

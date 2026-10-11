export const SEED_VERSION = '1';

/**
 * The fixed instant the seed JSON is generated against (`kv.json` meta `anchor`). At runtime the
 * Db shifts every seed date forward by the whole days between this and the visitor's first visit
 * (see `store/rebase.ts`), so "3 days ago" stays "3 days ago".
 */
export const SEED_ANCHOR = '2026-10-01T00:00:00.000Z';

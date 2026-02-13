/**
 * React Query key convention. Keep keys serializable and tuple-shaped so
 * cache eviction with `queryClient.invalidateQueries({ queryKey: [...] })`
 * can match by prefix.
 *
 * Each new feature area registers its keys here — do not define inline.
 */
import type { LocaleCode } from './types';

/**
 * Per-domain `staleTime` defaults. Pass these to `useQuery({ staleTime: … })`
 * in every consumer for the domain so the QueryClient's global default (60 s)
 * doesn't accidentally re-fetch reference data that changes slowly.
 *
 * Rule of thumb:
 *  - Reference data the catalog admins curate (categories/licenses/tags):
 *    minutes-to-an-hour — re-fetching on every back-button hit is wasteful.
 *  - User-specific surfaces (library, me, inbox): a couple of minutes — the
 *    user's own writes optimistically invalidate the keys, so a long
 *    staleTime is safe and warm navigations stay instant.
 *  - Discover / search results: a minute — public list pages can tolerate
 *    a touch of freshness lag, and visitors rarely need a sub-minute refresh
 *    on the same page.
 */
export const STALE_TIMES = {
  /** Categories rarely change in a session. */
  categories: 30 * 60_000,
  /** Licenses are essentially static for the lifetime of a session. */
  licenses: 60 * 60_000,
  /** Tag typeahead suggestions can be cached aggressively per query string. */
  tags: 30 * 60_000,
  /** User's saved-library listings — invalidated by save/unsave/download. */
  library: 2 * 60_000,
  /** /auth/me data — short so admin promote/demote shows up quickly. */
  me: 2 * 60_000,
  /** Discover & catalog feeds. */
  discover: 60_000,
  /** Search results. */
  search: 60_000,
} as const;

export const queryKeys = {
  me: ['me'] as const,

  notifications: (params: { unreadOnly?: boolean } = {}) =>
    ['notifications', params] as const,
  notificationsUnreadCount: ['notifications', 'unread-count'] as const,

  discover: (locale: LocaleCode) => ['discover', locale] as const,

  assets: (filters: Record<string, unknown> = {}) => ['assets', filters] as const,
  asset: (idOrSlug: string, locale: LocaleCode) => ['asset', idOrSlug, locale] as const,
  assetRecommended: (idOrSlug: string, locale: LocaleCode) =>
    ['asset', idOrSlug, 'recommended', locale] as const,

  library: (filters: Record<string, unknown> = {}) => ['library', filters] as const,
  libraryAll: ['library'] as const,
  savedIds: ['library', 'saved-ids'] as const,

  searchAssets: (q: string, filters: Record<string, unknown> = {}) =>
    ['search', 'assets', q, filters] as const,

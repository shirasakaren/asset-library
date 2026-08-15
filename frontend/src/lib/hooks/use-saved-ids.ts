'use client';

import { useQuery } from '@tanstack/react-query';
import { useAuthedFetch } from '@/lib/api/client';
import { queryKeys, STALE_TIMES } from '@/lib/api/queries';
import type { LibraryPage } from '@/lib/api/types';

// Stable empty reference so consumers don't see a new Set identity each render
// while the query is loading.
const EMPTY_SAVED_IDS = new Set<string>();

/**
 * Single client-side source of the current user's saved-asset IDs, used to
 * render heart state on cards across Discover, Search, and recommendations.
 *
 * Replaces three independent server-side `/library?limit=100` fetches (one per
 * page) with one cached query. The key sits under the `['library']` prefix so
 * `useSaveToggle` (which invalidates `queryKeys.libraryAll`) refreshes it for
 * free. First paint shows unfilled hearts; they hydrate a frame later, which is
 * fine for decorative state.
 */
export function useSavedIds(): Set<string> {
  const fetcher = useAuthedFetch();
  const { data } = useQuery({
    queryKey: queryKeys.savedIds,
    queryFn: async () => {
      const page = await fetcher<LibraryPage>('/library', { query: { limit: 100 } });
      return new Set(page.items.map((i) => i.asset.id));
    },
    staleTime: STALE_TIMES.library,
  });
  return data ?? EMPTY_SAVED_IDS;
}

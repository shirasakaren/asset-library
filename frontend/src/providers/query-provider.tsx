'use client';

import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Global TanStack defaults. Per-domain overrides live next to each
 * `useQuery` call and pull their `staleTime` from `STALE_TIMES` in
 * `@/lib/api/queries` — that's the single source of truth for "how long
 * is this kind of data fresh for".
 *
 * - `staleTime: 60_000`: a reasonable floor so warm navigations (back-button,
 *   tab switches) don't fire a refetch within the first minute. Per-domain
 *   values lengthen this for reference data (categories/licenses/tags).
 * - `gcTime: 30 min`: keep cached responses around long enough that a typical
 *   browsing session never re-fetches the same key, even after route changes.
 * - `refetchOnWindowFocus: false`: tab refocus shouldn't trigger refetches
 *   — the WebSocket fan-out already invalidates the keys that need it.
 * - `refetchOnReconnect: 'always'`: on network reconnect, always re-verify
 *   to surface stale-while-offline data quickly.
 * - `retry: 1` for transient blips; 4xx (except 408/429) short-circuits via
 *   the custom predicate to avoid hammering the API on auth/validation errors.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            gcTime: 30 * 60_000,
            refetchOnWindowFocus: false,
            refetchOnReconnect: 'always',
            retry: (failureCount, error) => {
              const status = (error as { status?: number } | null)?.status;
              if (status && status >= 400 && status < 500 && status !== 408 && status !== 429) {
                return false;
              }
              return failureCount < 1;
            },
          },
          mutations: {
            retry: 0,
          },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

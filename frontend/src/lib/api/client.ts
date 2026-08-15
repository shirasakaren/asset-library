'use client';

import { useSession, getSession } from 'next-auth/react';
import { useCallback } from 'react';
import { useLocale } from 'next-intl';
import { apiFetch, type ApiFetchInit } from './fetcher';
import type { LocaleCode } from './types';

/**
 * Client-side wrapper that automatically forwards the session access token
 * + the current locale to every request. Use inside client components
 * (TanStack Query, mutations). Server-side code should call apiFetch
 * directly with `accessToken` from the resolved session.
 *
 * Also supplies a tokenRefresher so apiFetch can retry once on a 401:
 * SessionProvider polls /api/auth/session every 4 min to keep the in-memory
 * session ahead of Keycloak's 5 min access-token TTL, but a request that
 * lands right at the expiry boundary can still 401 once. The refresher
 * forces an immediate /api/auth/session refetch (which runs the JWT-callback
 * refresh-token grant) and the call retries with the new token.
 */
export function useAuthedFetch() {
  const { data: session } = useSession();
  const locale = useLocale() as LocaleCode;
  return useCallback(
    <T = unknown>(path: string, init: ApiFetchInit = {}): Promise<T> =>
      apiFetch<T>(path, {
        accessToken: session?.accessToken,
        locale: init.locale ?? locale,
        tokenRefresher: async () => (await getSession())?.accessToken,
        ...init,
      }),
    [session?.accessToken, locale],
  );
}

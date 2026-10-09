'use client';

import { useCallback } from 'react';
import { useLocale } from 'next-intl';
import { apiFetch, type ApiFetchInit } from './fetcher';
import type { LocaleCode } from './types';

/**
 * Client-side wrapper that forwards the current locale to every request. Use
 * inside client components (TanStack Query, mutations). There is no token or
 * refresh logic: requests are served by the in-browser preview backend.
 */
export function useAuthedFetch() {
  const locale = useLocale() as LocaleCode;
  return useCallback(
    <T = unknown>(path: string, init: ApiFetchInit = {}): Promise<T> =>
      apiFetch<T>(path, { locale, ...init }),
    [locale],
  );
}

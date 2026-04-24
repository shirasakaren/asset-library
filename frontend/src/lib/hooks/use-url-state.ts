'use client';

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/**
 * URL-state hook for filters. All updates flow through `router.replace`
 * with `scroll: false` so the scroll position survives filter changes.
 */
export function useUrlState() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const params = useMemo(() => new URLSearchParams(searchParams?.toString() ?? ''), [searchParams]);

  const setParams = useCallback(
    (patch: Record<string, string | string[] | undefined | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(patch)) {
        next.delete(key);
        if (value == null) continue;
        if (Array.isArray(value)) {
          for (const v of value) if (v) next.append(key, v);
        } else if (value !== '') {
          next.set(key, value);
        }
      }
      const search = next.toString();
      router.replace(`${pathname}${search ? `?${search}` : ''}`, { scroll: false });
    },
    [params, pathname, router],
  );

  const reset = useCallback(() => {
    router.replace(pathname ?? '/', { scroll: false });
  }, [pathname, router]);

  const get = useCallback((key: string) => params.get(key), [params]);
  const getAll = useCallback((key: string) => params.getAll(key), [params]);

  return { params, get, getAll, setParams, reset };
}

'use client';

import { useEffect, useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { AssetCard } from '@/components/asset/asset-card';
import { AssetCardSkeleton } from '@/components/asset/asset-card-skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { useAuthedFetch } from '@/lib/api/client';
import { queryKeys, STALE_TIMES } from '@/lib/api/queries';
import { useSavedIds } from '@/lib/hooks/use-saved-ids';
import { useIntersection } from '@/lib/hooks/use-intersection';
import { useUrlState } from '@/lib/hooks/use-url-state';
import { logEvent } from '@/lib/logger.events';
import { formatNumber } from '@/lib/format';
import type { AssetListPage, LocaleCode } from '@/lib/api/types';

export function SearchResults() {
  const fetcher = useAuthedFetch();
  const savedIds = useSavedIds();
  const t = useTranslations('search');
  const locale = useLocale() as LocaleCode;
  const searchParams = useSearchParams();
  const { reset } = useUrlState();

  const filters = useMemo(() => {
    const out: Record<string, string | string[]> = {};
    const entries = Array.from(searchParams?.entries() ?? []);
    for (const [k, v] of entries) {
      if (!v) continue;
      const existing = out[k];
      if (existing === undefined) {
        out[k] = v;
      } else if (Array.isArray(existing)) {
        existing.push(v);
      } else {
        out[k] = [existing, v];
      }
    }
    return out;
  }, [searchParams]);

  const query = useInfiniteQuery({
    queryKey: queryKeys.searchAssets((filters.q as string) ?? '', filters),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      fetcher<AssetListPage>('/assets', {
        query: {
          ...filters,
          limit: 24,
          cursor: pageParam,
          locale,
        },
      }),
    getNextPageParam: (last) => (last.pageInfo.hasMore ? (last.pageInfo.nextCursor ?? undefined) : undefined),
    staleTime: STALE_TIMES.search,
  });

  const { ref: sentinelRef, isIntersecting } = useIntersection<HTMLDivElement>({ rootMargin: '320px' });

  useEffect(() => {
    if (isIntersecting && query.hasNextPage && !query.isFetchingNextPage) {
      void query.fetchNextPage();
    }
  }, [isIntersecting, query]);


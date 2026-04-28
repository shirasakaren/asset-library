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

  useEffect(() => {
    logEvent('search.filter_change', filters);
  }, [filters]);

  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  const total = query.data?.pages[0]?.items.length ?? 0;
  const q = (filters.q as string) ?? '';

  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-3 mb-5">
        <h1 className="font-display text-h1 text-ink tracking-[-0.015em]">{t('title')}</h1>
        {!query.isPending ? (
          <p className="text-body-sm text-ink-3 geist-tnum">
            {t('resultCount', { count: items.length })}
            {q ? ` ${t('queryEcho', { query: q })}` : ''}
          </p>
        ) : null}
        {total === 0 ? null : null}
      </div>

      {query.isPending ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <AssetCardSkeleton key={i} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title={t('emptyTitle')}
          description={t('emptyBody')}
          seed="search-empty"
          primaryAction={<Button onClick={reset}>Clear filters</Button>}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {items.map((asset, i) => (
              <AssetCard
                key={asset.id}
                variant="grid"
                asset={asset}
                isSaved={savedIds.has(asset.id)}
                priority={i < 4}
              />
            ))}
          </div>
          <div ref={sentinelRef} className="h-12 mt-6">
            {query.isFetchingNextPage ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <AssetCardSkeleton key={i} />
                ))}
              </div>
            ) : !query.hasNextPage ? (
              <p className="text-center text-caption text-ink-3">{t('endOfResults')}</p>
            ) : null}
          </div>
        </>
      )}
      <p className="sr-only">{formatNumber(total, locale)} results</p>
    </div>
  );
}

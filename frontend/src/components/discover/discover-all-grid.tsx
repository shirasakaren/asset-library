'use client';

import { useEffect, useMemo, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { AssetCard } from '@/components/asset/asset-card';
import { AssetCardSkeleton } from '@/components/asset/asset-card-skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { useAuthedFetch } from '@/lib/api/client';
import { queryKeys, STALE_TIMES } from '@/lib/api/queries';
import { useSavedIds } from '@/lib/hooks/use-saved-ids';
import { useIntersection } from '@/lib/hooks/use-intersection';
import { logEvent } from '@/lib/logger.events';
import type { AssetListPage, Engine, SortOrder } from '@/lib/api/types';
import { cn } from '@/lib/utils';

const ENGINE_FILTERS: { label: string; value: Engine | 'ALL' }[] = [
  { label: 'All', value: 'ALL' },
  { label: 'Unity', value: 'UNITY' },
  { label: 'Unreal', value: 'UNREAL' },
  { label: 'Engine-agnostic', value: 'ENGINE_AGNOSTIC' },
];

const SORTS: SortOrder[] = ['newest', 'mostDownloaded', 'recentlyUpdated', 'alphabetical', 'mostSaved'];

interface DiscoverAllGridProps {
  ownAssetIds: Set<string>;
}

export function DiscoverAllGrid({ ownAssetIds }: DiscoverAllGridProps) {
  const t = useTranslations('discover');
  const fetcher = useAuthedFetch();
  const savedIds = useSavedIds();
  const [engine, setEngine] = useState<Engine | 'ALL'>('ALL');
  const [sort, setSort] = useState<SortOrder>('newest');

  const filters = useMemo(
    () => ({
      sort,
      ...(engine !== 'ALL' ? { engine } : {}),
    }),
    [engine, sort],
  );

  const query = useInfiniteQuery({
    queryKey: queryKeys.assets({ ...filters, scope: 'discover-all' }),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      fetcher<AssetListPage>('/assets', {
        query: {
          ...filters,
          limit: 24,
          cursor: pageParam,
        },
      }),
    getNextPageParam: (last) => (last.pageInfo.hasMore ? (last.pageInfo.nextCursor ?? undefined) : undefined),
    staleTime: STALE_TIMES.discover,
  });

  const { ref: sentinelRef, isIntersecting } = useIntersection<HTMLDivElement>({ rootMargin: '320px' });

  useEffect(() => {
    if (isIntersecting && query.hasNextPage && !query.isFetchingNextPage) {
      void query.fetchNextPage();
    }
  }, [isIntersecting, query]);

  useEffect(() => {
    logEvent('discover.all_filter_change', { engine, sort });
  }, [engine, sort]);

  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  const isLoading = query.isPending;

  return (
    <section>
      <div className="flex flex-wrap items-center gap-3 justify-between mb-5">
        <div className="flex flex-wrap items-center gap-2">
          {ENGINE_FILTERS.map((e) => {
            const active = engine === e.value;
            return (
              <button
                key={e.value}
                type="button"
                onClick={() => setEngine(e.value)}
                aria-pressed={active}
                className={cn(
                  'inline-flex items-center h-9 px-3.5 rounded-full text-[13.5px] font-medium border transition-colors duration-120',
                  active
                    ? 'bg-ink text-white border-ink'
                    : 'bg-surface text-ink-2 border-line hover:border-ink/30 hover:text-ink',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2',
                )}
              >
                {e.label}
              </button>
            );
          })}
        </div>
        <label className="inline-flex items-center gap-2 text-caption text-ink-3">
          <span>{t('sortLabel')}</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortOrder)}
            className="h-9 rounded-[10px] border border-line bg-surface text-[13.5px] text-ink px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
          >
            {SORTS.map((s) => (
              <option key={s} value={s}>
                {t(`sort.${s}` as 'sort.newest')}
              </option>
            ))}
          </select>
        </label>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <AssetCardSkeleton key={i} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState title={t('emptyTitle')} description={t('emptyBody')} seed="discover-empty" />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {items.map((asset, i) => (
              <AssetCard
                key={asset.id}
                variant="grid"
                asset={asset}
                isSaved={savedIds.has(asset.id)}
                isOwner={ownAssetIds.has(asset.id)}
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
              <p className="text-center text-caption text-ink-3">{t('endOfFeed')}</p>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}

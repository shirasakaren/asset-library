'use client';

import { useEffect, useMemo, useState } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import NextLink from 'next/link';
import { useSearchParams } from 'next/navigation';
import { LayoutGrid, List } from 'lucide-react';
import { AssetCard } from '@/components/asset/asset-card';
import { AssetCardSkeleton } from '@/components/asset/asset-card-skeleton';
import { DownloadPopup } from '@/components/asset/download-popup';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toaster';
import { useAuthedFetch } from '@/lib/api/client';
import { queryKeys, STALE_TIMES } from '@/lib/api/queries';
import { useIntersection } from '@/lib/hooks/use-intersection';
import { useLibraryView } from '@/lib/stores/library-view';
import { logEvent } from '@/lib/logger.events';
import { useWsStore } from '@/lib/ws';
import type { LibraryPage, LocaleCode } from '@/lib/api/types';
import { cn } from '@/lib/utils';

export function LibraryGrid() {
  const fetcher = useAuthedFetch();
  const queryClient = useQueryClient();
  const t = useTranslations('library');
  const tCommon = useTranslations('common');
  const locale = useLocale() as LocaleCode;
  const searchParams = useSearchParams();
  const { view, setView } = useLibraryView();
  const subscribe = useWsStore((s) => s.subscribe);
  const [newVersionIds, setNewVersionIds] = useState<Set<string>>(new Set());

  const filters = useMemo(() => {
    const out: Record<string, string | string[]> = { hidden: 'false' };
    const entries = Array.from(searchParams?.entries() ?? []);
    for (const [k, v] of entries) {
      if (!v) continue;
      if (k === 'hidden') {
        out[k] = v;
        continue;
      }
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
    queryKey: queryKeys.library(filters),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      fetcher<LibraryPage>('/library', {
        query: { ...filters, limit: 24, cursor: pageParam, locale },
      }),
    getNextPageParam: (last) => (last.pageInfo.hasMore ? (last.pageInfo.nextCursor ?? undefined) : undefined),
    staleTime: STALE_TIMES.library,
  });

  const { ref: sentinelRef, isIntersecting } = useIntersection<HTMLDivElement>({ rootMargin: '320px' });

  useEffect(() => {
    if (isIntersecting && query.hasNextPage && !query.isFetchingNextPage) {
      void query.fetchNextPage();
    }
  }, [isIntersecting, query]);

  // Live: notification:new of type VERSION_PUBLISHED bumps a row's badge.
  // The WS envelope's payload shape (see notify.worker.ts) is
  // { type: NotificationType, payload: <typed payload> }.
  useEffect(() => {
    return subscribe('notification:new', (msg) => {
      const envelope = (msg.payload ?? {}) as {
        type?: string;
        payload?: { assetId?: string };
      };
      const assetId = envelope.payload?.assetId;
      if (envelope.type === 'VERSION_PUBLISHED' && assetId) {
        setNewVersionIds((prev) => {
          if (prev.has(assetId)) return prev;
          const next = new Set(prev);
          next.add(assetId);
          return next;
        });
      }
    });
  }, [subscribe]);

  const hideMutation = useMutation({
    mutationFn: ({ assetId, hidden }: { assetId: string; hidden: boolean }) =>
      fetcher(`/library/items/${assetId}`, {
        method: 'PATCH',
        body: { hidden },
      }),
    onMutate: async ({ assetId, hidden }) => {
      logEvent('library.hide_toggle', { assetId, hidden });
      const prev = queryClient.getQueriesData<LibraryPage>({ queryKey: queryKeys.libraryAll });
      queryClient.setQueriesData<{ pages: LibraryPage[]; pageParams: unknown[] } | undefined>(
        { queryKey: queryKeys.libraryAll },
        (data) => {
          if (!data) return data;
          return {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              items: page.items.map((item) =>
                item.asset.id === assetId ? { ...item, hidden } : item,
              ),
            })),
          };
        },
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      ctx?.prev.forEach(([key, data]) => queryClient.setQueryData(key, data));
      toast.error('Could not update visibility');
    },
    onSuccess: (_d, vars) => {
      toast.success(vars.hidden ? t('hideToast') : t('unhideToast'));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.libraryAll });
    },
  });

  const [downloadFor, setDownloadFor] = useState<{ id: string; title: string; versionId: string } | null>(
    null,
  );

  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  const allFilters = Object.keys(filters).filter((k) => filters[k] && (Array.isArray(filters[k]) ? (filters[k] as unknown[]).length : true));
  const isFiltered = allFilters.some((k) => k !== 'hidden') || filters.hidden !== 'false';

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex items-baseline gap-3">
          <h1 className="font-display text-h1 text-ink tracking-[-0.015em]">{t('title')}</h1>
          {!query.isPending ? (
            <p className="text-body-sm text-ink-3 geist-tnum">{items.length}</p>
          ) : null}
        </div>
        <div className="inline-flex rounded-[10px] border border-line p-1">
          <button
            type="button"
            onClick={() => setView('grid')}
            aria-pressed={view === 'grid'}
            aria-label={t('viewGrid')}
            className={cn(
              'inline-flex h-8 w-8 items-center justify-center rounded-[8px] transition-colors duration-120',
              view === 'grid' ? 'bg-ink text-white' : 'text-ink-2 hover:bg-surface-muted',
            )}
          >
            <LayoutGrid className="h-3.5 w-3.5" strokeWidth={2.25} />
          </button>
          <button
            type="button"
            onClick={() => setView('list')}
            aria-pressed={view === 'list'}
            aria-label={t('viewList')}
            className={cn(
              'inline-flex h-8 w-8 items-center justify-center rounded-[8px] transition-colors duration-120',
              view === 'list' ? 'bg-ink text-white' : 'text-ink-2 hover:bg-surface-muted',
            )}
          >
            <List className="h-3.5 w-3.5" strokeWidth={2.25} />
          </button>
        </div>
      </div>

      {query.isPending ? (
        <div className={view === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4' : 'flex flex-col gap-3'}>
          {Array.from({ length: 8 }).map((_, i) => (
            <AssetCardSkeleton key={i} variant={view === 'grid' ? 'grid' : 'row'} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title={isFiltered ? t('noMatchTitle') : t('emptyTitle')}
          description={isFiltered ? undefined : t('emptyBody')}
          seed="library-empty"
          primaryAction={
            isFiltered ? (
              <Button asChild variant="ghost">
                <a href="/library">{tCommon('clearFilters')}</a>
              </Button>
            ) : (
              <Button asChild>
                <NextLink href="/">{t('browseAssets')}</NextLink>
              </Button>
            )
          }
        />
      ) : view === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {items.map((item) => (
            <AssetCard
              key={item.asset.id}
              variant="grid"
              asset={item.asset}
              isSaved
              hidden={item.hidden}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((item) => (
            <AssetCard
              key={item.asset.id}
              variant="row"
              asset={item.asset}
              isSaved
              hidden={item.hidden}
              onHide={() => hideMutation.mutate({ assetId: item.asset.id, hidden: !item.hidden })}
              onQuickDownload={() =>
                setDownloadFor({
                  id: item.asset.id,
                  title: item.asset.title,
                  versionId: 'latest',
                })
              }
              trailingAction={
                newVersionIds.has(item.asset.id) ? (
                  <span className="ml-2 inline-flex items-center h-6 px-2 rounded-full bg-brand-yellow-50 text-ink text-[11px] font-medium border border-brand-yellow/40">
                    {t('newVersionAvailable')}
                  </span>
                ) : null
              }
            />
          ))}
        </div>
      )}

      <div ref={sentinelRef} className="h-12 mt-6">
        {query.isFetchingNextPage ? (
          <div className={view === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4' : 'flex flex-col gap-3'}>
            {Array.from({ length: 4 }).map((_, i) => (
              <AssetCardSkeleton key={i} variant={view === 'grid' ? 'grid' : 'row'} />
            ))}
          </div>
        ) : null}
      </div>

      {downloadFor ? (
        <DownloadPopup
          open={!!downloadFor}
          onOpenChange={(o) => !o && setDownloadFor(null)}
          assetId={downloadFor.id}
          assetTitle={downloadFor.title}
          initialVersionId={downloadFor.versionId}
        />
      ) : null}
    </div>
  );
}

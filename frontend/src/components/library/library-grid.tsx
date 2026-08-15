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

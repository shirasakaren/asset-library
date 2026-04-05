'use client';

import { useEffect, useMemo, useState } from 'react';
import NextLink from 'next/link';
import { useInfiniteQuery } from '@tanstack/react-query';
import { MoreHorizontal, ExternalLink, Edit, Archive, RefreshCcw, Trash2, UserCog } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { DataTable } from './data-table';
import { useAuthedFetch } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/queries';
import { useUrlState } from '@/lib/hooks/use-url-state';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';
import { useIntersection } from '@/lib/hooks/use-intersection';
import { formatDate, formatNumber } from '@/lib/format';
import { useLocale } from 'next-intl';
import { AdminForceDeleteModal } from './force-delete-modal';
import { AdminTransferModal } from './transfer-modal';
import { toast } from '@/components/ui/toaster';
import type { AdminAssetListPage, AdminAssetRow } from '@/lib/api/admin-types';
import type { AssetStatus, LocaleCode } from '@/lib/api/types';

const STATUSES: { value: AssetStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'PUBLISHED', label: 'Published' },
  { value: 'ARCHIVED', label: 'Archived' },
  { value: 'DELETED', label: 'Deleted' },
];

const STATUS_VARIANT: Record<AssetStatus, 'warning' | 'success' | 'neutral' | 'danger'> = {
  DRAFT: 'warning',
  PUBLISHED: 'success',
  ARCHIVED: 'neutral',
  DELETED: 'danger',
};

export function AdminAssetsTable() {
  const fetcher = useAuthedFetch();
  const locale = useLocale() as LocaleCode;
  const { get, setParams, reset } = useUrlState();
  const [search, setSearch] = useState(get('q') ?? '');
  const debouncedSearch = useDebouncedValue(search, 250);

  useEffect(() => {
    if ((get('q') ?? '') !== debouncedSearch) {
      setParams({ q: debouncedSearch || null, cursor: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const status = (get('status') ?? 'ALL') as AssetStatus | 'ALL';
  const sort = get('sort') ?? 'recentlyUpdated';

  const query = useInfiniteQuery({
    queryKey: queryKeys.adminAssets({ q: debouncedSearch, status, sort }),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      fetcher<AdminAssetListPage>('/admin/assets', {
        query: {
          q: debouncedSearch || undefined,
          status: status === 'ALL' ? undefined : status,
          sort,
          cursor: pageParam,
          limit: 50,
        },
      }),
    getNextPageParam: (last) => (last.pageInfo.hasMore ? (last.pageInfo.nextCursor ?? undefined) : undefined),
    staleTime: 15_000,
  });

  const { ref: sentinelRef, isIntersecting } = useIntersection<HTMLDivElement>({ rootMargin: '320px' });
  useEffect(() => {
    if (isIntersecting && query.hasNextPage && !query.isFetchingNextPage) {
      void query.fetchNextPage();
    }
  }, [isIntersecting, query]);

  const items: AdminAssetRow[] = useMemo(() => query.data?.pages.flatMap((p) => p.items) ?? [], [query.data]);
  const counts = query.data?.pages[0]?.counts;

  const [forceDeleteFor, setForceDeleteFor] = useState<AdminAssetRow | null>(null);
  const [transferFor, setTransferFor] = useState<AdminAssetRow | null>(null);

  const doArchive = async (row: AdminAssetRow) => {
    try {
      await fetcher(`/assets/${row.id}/archive`, { method: 'POST' });
      toast.success(`Archived ${row.title}`);
      void query.refetch();
    } catch (err) {
      toast.error('Could not archive', { description: err instanceof Error ? err.message : String(err) });
    }
  };
  const doRestore = async (row: AdminAssetRow) => {
    try {
      await fetcher(`/assets/${row.id}/restore`, { method: 'POST' });
      toast.success(`Restored ${row.title}`);
      void query.refetch();
    } catch (err) {
      toast.error('Could not restore', { description: err instanceof Error ? err.message : String(err) });
    }
  };
  const doSoftDelete = async (row: AdminAssetRow) => {
    try {
      await fetcher(`/assets/${row.id}`, { method: 'DELETE' });
      toast.success(`Deleted ${row.title}`);
      void query.refetch();
    } catch (err) {
      toast.error('Could not delete', { description: err instanceof Error ? err.message : String(err) });
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex flex-wrap items-center gap-1">
          {STATUSES.map((s) => {
            const active = status === s.value;
            const count =
              s.value === 'ALL'
                ? items.length
                : counts?.[s.value as AssetStatus] ?? 0;
            return (
              <button
                key={s.value}
                type="button"
                onClick={() =>
                  setParams({ status: s.value === 'ALL' ? null : s.value, cursor: null })
                }
                className={`inline-flex items-center h-8 px-3 rounded-full text-[12.5px] font-medium border transition-colors ${
                  active
                    ? 'bg-ink text-white border-ink'
                    : 'bg-surface text-ink-2 border-line hover:border-ink/30 hover:text-ink'
                }`}
              >
                {s.label}
                {count ? (
                  <span className={`ml-2 geist-tnum ${active ? 'text-white/70' : 'text-ink-3'}`}>
                    {count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Input
            inputSize="sm"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, owner, or slug"
            className="w-[280px]"
          />
          <select
            value={sort}
            onChange={(e) => setParams({ sort: e.target.value === 'recentlyUpdated' ? null : e.target.value })}
            className="h-9 rounded-[10px] border border-line bg-surface text-[13.5px] text-ink px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
          >
            <option value="recentlyUpdated">Recently updated</option>
            <option value="newest">Newest</option>
            <option value="alphabetical">A → Z</option>
            <option value="mostDownloaded">Most downloaded</option>
          </select>
          {get('q') ? (
            <Button variant="ghost" onClick={reset}>
              Reset
            </Button>
          ) : null}
        </div>
      </div>

      <DataTable
        rows={items}
        empty="No assets match this filter."
        columns={[
          {
            key: 'thumb',
            header: '',
            className: 'w-[88px]',
            cell: (r) => (
              <div className="h-12 w-20 rounded-[6px] overflow-hidden bg-surface-muted border border-line">
                {r.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                ) : null}
              </div>
            ),
          },
          {
            key: 'title',
            header: 'Title',
            cell: (r) => (
              <NextLink href={`/assets/${r.slug || r.id}`} className="font-medium text-ink hover:underline">
                {r.title}
              </NextLink>

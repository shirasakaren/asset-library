'use client';

import NextLink from 'next/link';
import { useEffect } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { AdminPageHeader } from '@/components/admin/admin-page-header';
import { DataTable } from '@/components/admin/data-table';
import { Badge } from '@/components/ui/badge';
import { useAuthedFetch } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/queries';
import { useUrlState } from '@/lib/hooks/use-url-state';
import { useIntersection } from '@/lib/hooks/use-intersection';
import { formatRelative } from '@/lib/format';
import { useLocale } from 'next-intl';
import type { AdminAssetRequestPage } from '@/lib/api/admin-types';
import type { AssetRequestStatus, LocaleCode } from '@/lib/api/types';
import { cn } from '@/lib/utils';

const STATUSES: { value: AssetRequestStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'SENT', label: 'Sent' },
  { value: 'IN_REVIEW', label: 'In review' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
];

const TONE: Record<AssetRequestStatus, 'neutral' | 'info' | 'warning' | 'success' | 'danger'> = {
  SENT: 'neutral',
  IN_REVIEW: 'info',
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
};

export default function AdminRequestsPage() {
  const fetcher = useAuthedFetch();
  const locale = useLocale() as LocaleCode;
  const { get, setParams } = useUrlState();
  const status = (get('status') ?? 'ALL') as AssetRequestStatus | 'ALL';

  const list = useInfiniteQuery({
    queryKey: queryKeys.adminAssetRequests({ status }),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      fetcher<AdminAssetRequestPage>('/admin/asset-requests', {
        query: { status: status === 'ALL' ? undefined : status, cursor: pageParam, limit: 50 },
      }),
    getNextPageParam: (last) => (last.pageInfo.hasMore ? (last.pageInfo.nextCursor ?? undefined) : undefined),
    staleTime: 15_000,
  });

  const { ref: sentinelRef, isIntersecting } = useIntersection<HTMLDivElement>();
  useEffect(() => {
    if (isIntersecting && list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
  }, [isIntersecting, list]);

  const rows = list.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <>
      <AdminPageHeader title="Asset requests" description="Sourcing requests from users." />
      <div className="flex items-center gap-1 mb-4 flex-wrap">
        {STATUSES.map((s) => {
          const active = status === s.value;
          return (
            <button
              key={s.value}
              type="button"
              onClick={() => setParams({ status: s.value === 'ALL' ? null : s.value, cursor: null })}
              className={cn(
                'inline-flex items-center h-8 px-3 rounded-full text-[12.5px] font-medium border transition-colors',
                active
                  ? 'bg-ink text-white border-ink'
                  : 'bg-surface text-ink-2 border-line hover:border-ink/30 hover:text-ink',
              )}
            >
              {s.label}
            </button>
          );
        })}
      </div>
      <DataTable
        rows={rows}
        empty="No requests."
        onRowClick={(r) => {
          window.location.href = `/admin/requests/${r.id}`;
        }}
        columns={[
          { key: 'requester', header: 'Requester', cell: (r) => r.requester.displayName },
          {
            key: 'link',
            header: 'Link',
            cell: (r) => (
              <a href={r.assetLink} target="_blank" rel="noopener noreferrer" className="link-inline font-mono text-[12.5px] truncate inline-block max-w-[280px]">
                {r.assetLink}
              </a>
            ),
          },
          { key: 'type', header: 'Type', cell: (r) => r.assetType },
          {
            key: 'submitted',
            header: 'Submitted',
            cell: (r) => <span className="text-caption text-ink-3 geist-tnum">{formatRelative(r.createdAt, locale)}</span>,
          },
          { key: 'status', header: 'Status', cell: (r) => <Badge variant={TONE[r.status]}>{r.status}</Badge> },
        ]}
      />
      <div ref={sentinelRef} className="h-10 mt-3 text-center text-caption text-ink-3">
        {list.isFetchingNextPage ? 'Loading…' : null}
      </div>
      <NextLink href="/" className="sr-only">
        Home
      </NextLink>
    </>
  );
}

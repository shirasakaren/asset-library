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
import type { AdminReport, AdminReportPage, ReportStatus } from '@/lib/api/admin-types';
import type { LocaleCode } from '@/lib/api/types';
import { cn } from '@/lib/utils';

const STATUSES: { value: ReportStatus | 'ALL'; label: string; tone: 'neutral' | 'info' | 'warning' | 'success' | 'danger' }[] = [
  { value: 'ALL', label: 'All', tone: 'neutral' },
  { value: 'OPEN', label: 'Open', tone: 'warning' },
  { value: 'REVIEWING', label: 'Reviewing', tone: 'info' },
  { value: 'ACTIONED', label: 'Actioned', tone: 'success' },
  { value: 'DISMISSED', label: 'Dismissed', tone: 'neutral' },
];

const TONE: Record<ReportStatus, 'warning' | 'info' | 'success' | 'neutral'> = {
  OPEN: 'warning',
  REVIEWING: 'info',
  ACTIONED: 'success',
  DISMISSED: 'neutral',
};

export default function AdminReportsPage() {
  const fetcher = useAuthedFetch();
  const locale = useLocale() as LocaleCode;
  const { get, setParams } = useUrlState();
  const status = (get('status') ?? 'ALL') as ReportStatus | 'ALL';

  const list = useInfiniteQuery({
    queryKey: queryKeys.adminReports({ status }),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      fetcher<AdminReportPage>('/admin/reports', {
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
      <AdminPageHeader title="Reports" description="Triage user reports about assets." />
      <div className="flex items-center gap-1 mb-4">
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
        rows={rows as (AdminReport & { id: string })[]}
        empty="No reports."
        onRowClick={(r) => {
          window.location.href = `/admin/reports/${r.id}`;
        }}
        columns={[
          { key: 'reporter', header: 'Reporter', cell: (r) => r.reporter.displayName },
          {
            key: 'asset',
            header: 'Asset',
            cell: (r) => (
              <NextLink href={`/assets/${r.assetSlug || r.assetId}`} className="font-medium text-ink hover:underline">
                {r.assetTitle}
              </NextLink>
            ),
          },
          {
            key: 'category',
            header: 'Category',
            cell: (r) => (r.category === 'MALICIOUS_FILE' ? 'Malicious' : 'Broken'),
          },
          {
            key: 'submitted',
            header: 'Submitted',
            cell: (r) => (
              <span className="text-caption text-ink-3 geist-tnum">{formatRelative(r.createdAt, locale)}</span>
            ),
          },
          {
            key: 'status',
            header: 'Status',
            cell: (r) => <Badge variant={TONE[r.status]}>{r.status}</Badge>,
          },
        ]}
      />
      <div ref={sentinelRef} className="h-10 mt-3 text-center text-caption text-ink-3">
        {list.isFetchingNextPage ? 'Loading…' : null}
      </div>
    </>
  );
}

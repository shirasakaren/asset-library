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
import { withBasePath } from '@/lib/base-path';

const STATUSES: {
  value: ReportStatus | 'ALL';
  label: string;
  tone: 'neutral' | 'info' | 'warning' | 'success' | 'danger';
}[] = [
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
    getNextPageParam: (last) =>
      last.pageInfo.hasMore ? (last.pageInfo.nextCursor ?? undefined) : undefined,
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
      <div className="mb-4 flex items-center gap-1">
        {STATUSES.map((s) => {
          const active = status === s.value;
          return (
            <button
              key={s.value}
              type="button"
              onClick={() =>
                setParams({ status: s.value === 'ALL' ? null : s.value, cursor: null })
              }
              className={cn(
                'inline-flex h-8 items-center rounded-full border px-3 text-[12.5px] font-medium transition-colors',
                active
                  ? 'border-ink bg-ink text-white'
                  : 'hover:border-ink/30 border-line bg-surface text-ink-2 hover:text-ink',
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
          window.location.href = withBasePath(`/admin/reports/${r.id}`);
        }}
        columns={[
          { key: 'reporter', header: 'Reporter', cell: (r) => r.reporter.displayName },
          {
            key: 'asset',
            header: 'Asset',
            cell: (r) => (
              <NextLink
                href={`/assets/${r.assetSlug || r.assetId}`}
                className="font-medium text-ink hover:underline"
              >
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
              <span className="geist-tnum text-caption text-ink-3">
                {formatRelative(r.createdAt, locale)}
              </span>
            ),
          },
          {
            key: 'status',
            header: 'Status',
            cell: (r) => <Badge variant={TONE[r.status]}>{r.status}</Badge>,
          },
        ]}
      />
      <div ref={sentinelRef} className="mt-3 h-10 text-center text-caption text-ink-3">
        {list.isFetchingNextPage ? 'Loading…' : null}
      </div>
    </>
  );
}

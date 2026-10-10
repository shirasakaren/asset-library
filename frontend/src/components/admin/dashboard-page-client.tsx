'use client';

import NextLink from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useLocale } from 'next-intl';
import { ArrowRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { AdminListSkeleton } from '@/components/admin/admin-list-skeleton';
import { AdminPageHeader } from '@/components/admin/admin-page-header';
import { StatCard } from '@/components/admin/stat-card';
// Recharts is lazy-loaded (client-only) via this wrapper so it never ships in
// shared chunks.
import { DashboardCharts } from '@/components/admin/dashboard-charts.lazy';
import { DataTable } from '@/components/admin/data-table';
import { Avatar } from '@/components/ui/avatar';
import { avatarFromServer } from '@/lib/avatar';
import { useAuthedFetch } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/queries';
import { formatNumber, formatRelative } from '@/lib/format';
import { useLogQueryError } from '@/lib/hooks/use-log-query-error';
import type { DashboardResponse } from '@/lib/api/admin-types';
import type { LocaleCode } from '@/lib/api/types';

/** Body of `/admin` (the admin layout / `withAdminChrome` supplies the chrome). */
export function AdminDashboardPageClient() {
  const locale = useLocale() as LocaleCode;
  const fetchApi = useAuthedFetch();
  const q = useQuery({
    queryKey: queryKeys.adminDashboard,
    queryFn: () => fetchApi<DashboardResponse>('/admin/dashboard'),
  });
  // A failed load is non-fatal: the page renders zeroed counts and empty lists, as before.
  useLogQueryError('admin.dashboard.fetch-failed', '/admin/dashboard', q.error);
  const data: DashboardResponse | null = q.data ?? null;

  if (q.isPending) {
    return (
      <>
        <AdminPageHeader
          title="Admin"
          description="Snapshot of platform health, recent activity, and pending work."
        />
        <AdminListSkeleton rows={8} />
      </>
    );
  }

  return (
    <>
      <AdminPageHeader
        title="Admin"
        description="Snapshot of platform health, recent activity, and pending work."
      />

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4 2xl:grid-cols-8">
        <StatCard
          label="Users"
          value={formatNumber(data?.counts.users ?? 0, locale)}
          href="/admin/users"
        />
        <StatCard
          label="Published"
          value={formatNumber(data?.counts.publishedAssets ?? 0, locale)}
          href="/admin/assets?status=PUBLISHED"
          tone="success"
        />
        <StatCard
          label="Drafts"
          value={formatNumber(data?.counts.draftAssets ?? 0, locale)}
          href="/admin/assets?status=DRAFT"
        />
        <StatCard
          label="Archived"
          value={formatNumber(data?.counts.archivedAssets ?? 0, locale)}
          href="/admin/assets?status=ARCHIVED"
        />
        <StatCard
          label="Downloads 30d"
          value={formatNumber(data?.counts.downloads30d ?? 0, locale)}
        />
        <StatCard
          label="Reports"
          value={formatNumber(data?.counts.pendingReports ?? 0, locale)}
          href="/admin/reports?status=OPEN"
          tone={data?.counts.pendingReports ? 'warn' : 'neutral'}
        />
        <StatCard
          label="Requests"
          value={formatNumber(data?.counts.pendingRequests ?? 0, locale)}
          href="/admin/requests"
          tone={data?.counts.pendingRequests ? 'warn' : 'neutral'}
        />
        <StatCard
          // No `href`: the AV queue has no page (`/admin/av` is a 404), so the card only shows the count.
          label="AV infected"
          value={formatNumber(data?.counts.avInfected ?? 0, locale)}
          tone={data?.counts.avInfected ? 'danger' : 'neutral'}
        />
      </section>

      <section className="mt-8">
        <DashboardCharts
          downloads={data?.charts.downloads30d ?? []}
          publishes={data?.charts.publishes30d ?? []}
          newUsers={data?.charts.newUsers30d ?? []}
          storage={data?.storage.byBucket ?? []}
        />
      </section>

      <section className="mt-10">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="font-display text-h2 tracking-[-0.01em] text-ink">
            Top assets · last 7 days
          </h2>
          <NextLink
            href="/admin/assets?sort=mostDownloaded"
            className="inline-flex items-center gap-1 text-caption text-brand-blue hover:underline"
          >
            View leaderboard
            <ArrowRight className="h-3 w-3" strokeWidth={2.25} />
          </NextLink>
        </div>
        <DataTable
          rows={(data?.topAssets7d ?? []).map((a) => ({ ...a, id: a.id }))}
          columns={[
            {
              key: 'title',
              header: 'Title',
              cell: (r) => (
                <NextLink
                  href={`/assets/${r.slug || r.id}`}
                  className="font-medium text-ink hover:underline"
                >
                  {r.title}
                </NextLink>
              ),
            },
            { key: 'owner', header: 'Owner', cell: (r) => r.ownerDisplayName },
            {
              key: 'downloads',
              header: 'Downloads',
              align: 'right',
              cell: (r) => <span className="geist-tnum">{formatNumber(r.downloads, locale)}</span>,
            },
            {
              key: 'saves',
              header: 'Saves',
              align: 'right',
              cell: (r) => <span className="geist-tnum">{formatNumber(r.saves, locale)}</span>,
            },
          ]}
        />
      </section>

      <section className="mt-10">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="font-display text-h2 tracking-[-0.01em] text-ink">Recent activity</h2>
          <NextLink
            href="/admin/audit"
            className="inline-flex items-center gap-1 text-caption text-brand-blue hover:underline"
          >
            Open audit log
            <ArrowRight className="h-3 w-3" strokeWidth={2.25} />
          </NextLink>
        </div>
        <Card padding="none">
          <ul className="divide-y divide-line">
            {(data?.recentAudit ?? []).slice(0, 15).map((entry) => (
              <li key={entry.id} className="flex items-center gap-3 px-4 py-3 text-[13.5px]">
                <Avatar
                  data={avatarFromServer({
                    initials: (
                      entry.actorDisplayName
                        ?.split(' ')
                        .map((p) => p[0])
                        .join('') || '?'
                    )
                      .slice(0, 2)
                      .toUpperCase(),
                    bgColor: 'brand-blue',
                    fgColor: 'ink-white',
                  })}
                  size={24}
                />
                <span className="truncate font-medium text-ink">
                  {entry.actorDisplayName ?? entry.actorEmail ?? 'System'}
                </span>
                <span className="text-ink-3">·</span>
                <span className="truncate font-mono text-[12px] text-ink-2">{entry.action}</span>
                <span className="hidden text-ink-3 sm:inline">·</span>
                <span className="hidden truncate text-ink-2 sm:inline">
                  {entry.subjectType}/{entry.subjectId}
                </span>
                <span className="geist-tnum ml-auto shrink-0 text-caption text-ink-3">
                  {formatRelative(entry.createdAt, locale)}
                </span>
              </li>
            ))}
            {(data?.recentAudit ?? []).length === 0 ? (
              <li className="px-4 py-6 text-body-sm text-ink-3">No recent activity.</li>
            ) : null}
          </ul>
        </Card>
      </section>
    </>
  );
}

'use client';

import NextLink from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useLocale } from 'next-intl';
import { ArrowLeft } from 'lucide-react';
import { AdminPageHeader } from '@/components/admin/admin-page-header';
import { AdminQueryState } from '@/components/admin/admin-query-state';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ReportDecisionForm } from '@/components/admin/report-decision-form';
import { useAuthedFetch } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/queries';
import { formatDate, formatRelative } from '@/lib/format';
import type { AdminReport } from '@/lib/api/admin-types';
import type { LocaleCode } from '@/lib/api/types';

/** Body of `/admin/reports/[id]` (the admin layout / `withAdminChrome` supplies the chrome). */
export function AdminReportPageClient({ id }: { id: string }) {
  const locale = useLocale() as LocaleCode;
  const fetchApi = useAuthedFetch();
  const q = useQuery({
    queryKey: queryKeys.adminReport(id),
    queryFn: () => fetchApi<AdminReport>(`/admin/reports/${encodeURIComponent(id)}`),
  });

  return (
    <AdminQueryState query={q}>
      {(report) => (
        <>
          <AdminPageHeader
            title={`Report #${report.id.slice(0, 8)}`}
            description={
              <span className="inline-flex items-center gap-2">
                <Badge
                  variant={
                    report.status === 'OPEN'
                      ? 'warning'
                      : report.status === 'ACTIONED'
                        ? 'success'
                        : 'neutral'
                  }
                >
                  {report.status}
                </Badge>
                <span className="geist-tnum text-caption text-ink-3">
                  Received {formatRelative(report.createdAt, locale)} from{' '}
                  {report.reporter.displayName}
                </span>
              </span>
            }
            actions={
              <NextLink
                href="/admin/reports"
                className="inline-flex items-center gap-1 text-caption text-brand-blue hover:underline"
              >
                <ArrowLeft className="h-3 w-3" strokeWidth={2.25} />
                Back to reports
              </NextLink>
            }
          />

          <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
            <div className="space-y-4">
              <Card padding="lg">
                <p className="mb-1 text-eyebrow uppercase tracking-[0.12em] text-ink-3">Asset</p>
                <NextLink
                  href={`/assets/${report.assetSlug || report.assetId}`}
                  className="font-display text-h2 tracking-[-0.01em] text-ink hover:underline"
                >
                  {report.assetTitle}
                </NextLink>
                <p className="font-mono text-caption text-ink-3">{report.assetSlug}</p>
              </Card>
              <Card padding="lg">
                <p className="mb-2 text-eyebrow uppercase tracking-[0.12em] text-ink-3">
                  Category:{' '}
                  {report.category === 'MALICIOUS_FILE'
                    ? 'Malicious file / security'
                    : 'Broken / non-functional'}
                </p>
                <p className="whitespace-pre-wrap text-body text-ink-2">{report.notes}</p>
              </Card>
            </div>
            <div>
              <Card padding="lg">
                <p className="mb-3 text-eyebrow uppercase tracking-[0.12em] text-ink-3">
                  Admin actions
                </p>
                <ReportDecisionForm report={report} />
                <p className="mt-4 text-caption text-ink-3">
                  Submitted{' '}
                  {formatDate(report.createdAt, locale, { dateStyle: 'long', timeStyle: 'short' })}
                </p>
                {report.resolvedAt ? (
                  <p className="text-caption text-ink-3">
                    Resolved{' '}
                    {formatDate(report.resolvedAt, locale, {
                      dateStyle: 'long',
                      timeStyle: 'short',
                    })}
                  </p>
                ) : null}
              </Card>
            </div>
          </div>
        </>
      )}
    </AdminQueryState>
  );
}

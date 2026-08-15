import { notFound } from 'next/navigation';
import NextLink from 'next/link';
import { getLocale } from 'next-intl/server';
import { ArrowLeft } from 'lucide-react';
import { AdminPageHeader } from '@/components/admin/admin-page-header';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ReportDecisionForm } from '@/components/admin/report-decision-form';
import { requireSession } from '@/lib/auth/server';
import { apiFetch } from '@/lib/api/fetcher';
import { ApiError } from '@/lib/api/errors';
import { formatDate, formatRelative } from '@/lib/format';
import type { AdminReport } from '@/lib/api/admin-types';
import type { LocaleCode } from '@/lib/api/types';

interface PageProps {
  params: Promise<{ id: string }>;
}

export const dynamic = 'force-dynamic';

export default async function AdminReportDetailPage({ params }: PageProps) {
  const { id } = await params;
  const session = await requireSession();
  const locale = (await getLocale()) as LocaleCode;
  let report: AdminReport;
  try {
    report = await apiFetch<AdminReport>(`/admin/reports/${id}`, {
      accessToken: session.accessToken,
      cache: 'no-store',
    });
  } catch (err) {
    if (ApiError.isApiError(err) && err.status === 404) notFound();
    throw err;
  }

  return (
    <>
      <AdminPageHeader
        title={`Report #${report.id.slice(0, 8)}`}
        description={
          <span className="inline-flex items-center gap-2">
            <Badge variant={report.status === 'OPEN' ? 'warning' : report.status === 'ACTIONED' ? 'success' : 'neutral'}>
              {report.status}
            </Badge>
            <span className="text-caption text-ink-3 geist-tnum">
              Received {formatRelative(report.createdAt, locale)} from {report.reporter.displayName}
            </span>
          </span>
        }
        actions={
          <NextLink href="/admin/reports" className="inline-flex items-center gap-1 text-caption text-brand-blue hover:underline">
            <ArrowLeft className="h-3 w-3" strokeWidth={2.25} />
            Back to reports
          </NextLink>
        }
      />

      <div className="grid lg:grid-cols-[1.5fr_1fr] gap-6">
        <div className="space-y-4">
          <Card padding="lg">
            <p className="text-eyebrow uppercase tracking-[0.12em] text-ink-3 mb-1">Asset</p>
            <NextLink
              href={`/assets/${report.assetSlug || report.assetId}`}
              className="font-display text-h2 text-ink tracking-[-0.01em] hover:underline"
            >
              {report.assetTitle}
            </NextLink>
            <p className="text-caption text-ink-3 font-mono">{report.assetSlug}</p>
          </Card>
          <Card padding="lg">
            <p className="text-eyebrow uppercase tracking-[0.12em] text-ink-3 mb-2">
              Category: {report.category === 'MALICIOUS_FILE' ? 'Malicious file / security' : 'Broken / non-functional'}
            </p>
            <p className="text-body text-ink-2 whitespace-pre-wrap">{report.notes}</p>
          </Card>
        </div>
        <div>
          <Card padding="lg">
            <p className="text-eyebrow uppercase tracking-[0.12em] text-ink-3 mb-3">Admin actions</p>
            <ReportDecisionForm report={report} />
            <p className="mt-4 text-caption text-ink-3">
              Submitted {formatDate(report.createdAt, locale, { dateStyle: 'long', timeStyle: 'short' })}
            </p>
            {report.resolvedAt ? (
              <p className="text-caption text-ink-3">
                Resolved {formatDate(report.resolvedAt, locale, { dateStyle: 'long', timeStyle: 'short' })}
              </p>
            ) : null}
          </Card>
        </div>
      </div>
    </>
  );
}

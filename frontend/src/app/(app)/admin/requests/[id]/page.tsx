import { notFound } from 'next/navigation';
import NextLink from 'next/link';
import { getLocale } from 'next-intl/server';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { AdminPageHeader } from '@/components/admin/admin-page-header';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RequestDecisionForm } from '@/components/admin/request-decision-form';
import { requireSession } from '@/lib/auth/server';
import { apiFetch } from '@/lib/api/fetcher';
import { ApiError } from '@/lib/api/errors';
import { formatDate } from '@/lib/format';
import type { AssetRequest, LocaleCode } from '@/lib/api/types';

interface PageProps {
  params: Promise<{ id: string }>;
}

export const dynamic = 'force-dynamic';

export default async function AdminRequestDetailPage({ params }: PageProps) {
  const { id } = await params;
  const session = await requireSession();
  const locale = (await getLocale()) as LocaleCode;
  let req: AssetRequest;
  try {
    req = await apiFetch<AssetRequest>(`/admin/asset-requests/${id}`, {
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
        title={`Request #${req.id.slice(0, 8)}`}
        description={
          <span className="inline-flex items-center gap-2">
            <Badge variant="info">{req.status}</Badge>
            <span className="text-caption text-ink-3 geist-tnum">
              From {req.requester.displayName} · {formatDate(req.createdAt, locale, { dateStyle: 'long' })}
            </span>
          </span>
        }
        actions={
          <NextLink href="/admin/requests" className="inline-flex items-center gap-1 text-caption text-brand-blue hover:underline">
            <ArrowLeft className="h-3 w-3" strokeWidth={2.25} />
            Back to requests
          </NextLink>
        }
      />
      <div className="grid lg:grid-cols-[1.5fr_1fr] gap-6">
        <div className="space-y-4">
          <Card padding="lg">
            <p className="text-eyebrow uppercase tracking-[0.12em] text-ink-3 mb-1">Asset link</p>
            <a
              href={req.assetLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 link-inline break-all"
            >
              {req.assetLink}
              <ExternalLink className="h-3 w-3" strokeWidth={2.25} />
            </a>
          </Card>
          <Card padding="lg">
            <p className="text-eyebrow uppercase tracking-[0.12em] text-ink-3 mb-2">Type</p>
            <p className="text-body text-ink">{req.assetType}</p>
          </Card>
          <Card padding="lg">
            <p className="text-eyebrow uppercase tracking-[0.12em] text-ink-3 mb-2">Intended use</p>
            <p className="text-body text-ink-2 whitespace-pre-wrap">{req.intendedUse}</p>
          </Card>
          {req.price !== null ? (
            <Card padding="lg">
              <p className="text-eyebrow uppercase tracking-[0.12em] text-ink-3 mb-2">Price</p>
              <p className="text-body text-ink geist-tnum">${req.price}</p>
            </Card>
          ) : null}
          {req.notes ? (
            <Card padding="lg">
              <p className="text-eyebrow uppercase tracking-[0.12em] text-ink-3 mb-2">Notes</p>
              <p className="text-body text-ink-2 whitespace-pre-wrap">{req.notes}</p>
            </Card>
          ) : null}
        </div>
        <div>
          <Card padding="lg">
            <p className="text-eyebrow uppercase tracking-[0.12em] text-ink-3 mb-3">Decision</p>
            <RequestDecisionForm request={req} />
          </Card>
        </div>
      </div>
    </>
  );
}

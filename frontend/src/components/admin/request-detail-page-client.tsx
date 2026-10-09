'use client';

import NextLink from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useLocale } from 'next-intl';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { AdminPageHeader } from '@/components/admin/admin-page-header';
import { AdminQueryState } from '@/components/admin/admin-query-state';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RequestDecisionForm } from '@/components/admin/request-decision-form';
import { useAuthedFetch } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/queries';
import { formatDate } from '@/lib/format';
import type { AssetRequest, LocaleCode } from '@/lib/api/types';

/** Body of `/admin/requests/[id]` (the admin layout / `withAdminChrome` supplies the chrome). */
export function AdminRequestPageClient({ id }: { id: string }) {
  const locale = useLocale() as LocaleCode;
  const fetchApi = useAuthedFetch();
  const q = useQuery({
    queryKey: queryKeys.adminAssetRequest(id),
    queryFn: () => fetchApi<AssetRequest>(`/admin/asset-requests/${encodeURIComponent(id)}`),
  });

  return (
    <AdminQueryState query={q}>
      {(req) => (
        <>
          <AdminPageHeader
            title={`Request #${req.id.slice(0, 8)}`}
            description={
              <span className="inline-flex items-center gap-2">
                <Badge variant="info">{req.status}</Badge>
                <span className="geist-tnum text-caption text-ink-3">
                  From {req.requester.displayName} ·{' '}
                  {formatDate(req.createdAt, locale, { dateStyle: 'long' })}
                </span>
              </span>
            }
            actions={
              <NextLink
                href="/admin/requests"
                className="inline-flex items-center gap-1 text-caption text-brand-blue hover:underline"
              >
                <ArrowLeft className="h-3 w-3" strokeWidth={2.25} />
                Back to requests
              </NextLink>
            }
          />
          <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
            <div className="space-y-4">
              <Card padding="lg">
                <p className="mb-1 text-eyebrow uppercase tracking-[0.12em] text-ink-3">
                  Asset link
                </p>
                <a
                  href={req.assetLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link-inline inline-flex items-center gap-1 break-all"
                >
                  {req.assetLink}
                  <ExternalLink className="h-3 w-3" strokeWidth={2.25} />
                </a>
              </Card>
              <Card padding="lg">
                <p className="mb-2 text-eyebrow uppercase tracking-[0.12em] text-ink-3">Type</p>
                <p className="text-body text-ink">{req.assetType}</p>
              </Card>
              <Card padding="lg">
                <p className="mb-2 text-eyebrow uppercase tracking-[0.12em] text-ink-3">
                  Intended use
                </p>
                <p className="whitespace-pre-wrap text-body text-ink-2">{req.intendedUse}</p>
              </Card>
              {req.price !== null ? (
                <Card padding="lg">
                  <p className="mb-2 text-eyebrow uppercase tracking-[0.12em] text-ink-3">Price</p>
                  <p className="geist-tnum text-body text-ink">${req.price}</p>
                </Card>
              ) : null}
              {req.notes ? (
                <Card padding="lg">
                  <p className="mb-2 text-eyebrow uppercase tracking-[0.12em] text-ink-3">Notes</p>
                  <p className="whitespace-pre-wrap text-body text-ink-2">{req.notes}</p>
                </Card>
              ) : null}
            </div>
            <div>
              <Card padding="lg">
                <p className="mb-3 text-eyebrow uppercase tracking-[0.12em] text-ink-3">Decision</p>
                <RequestDecisionForm request={req} />
              </Card>
            </div>
          </div>
        </>
      )}
    </AdminQueryState>
  );
}

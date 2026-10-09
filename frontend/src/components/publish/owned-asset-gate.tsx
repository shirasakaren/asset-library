'use client';

import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocale } from 'next-intl';
import { NotFoundContent } from '@/components/layout/not-found-content';
import { PageLoadError } from '@/components/layout/page-load-error';
import { PageSkeleton } from '@/components/layout/page-skeleton';
import { useAuthedFetch } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import { queryKeys } from '@/lib/api/queries';
import type { AssetDetail, LocaleCode } from '@/lib/api/types';
import { useMe } from '@/preview/session/me-provider';

interface OwnedAssetGateProps {
  id: string;
  children: (asset: AssetDetail) => ReactNode;
}

/**
 * Loads an asset (drafts included) for the publish flows and renders `children`
 * only for its owner or an admin. A missing asset and someone else's asset both
 * show the 404 view, as the server pages did with `notFound()`.
 */
export function OwnedAssetGate({ id, children }: OwnedAssetGateProps) {
  const me = useMe();
  const locale = useLocale() as LocaleCode;
  const fetchApi = useAuthedFetch();
  // Same key the wizard's own asset query uses, so the wizard starts from this data.
  const q = useQuery({
    queryKey: queryKeys.asset(id, locale),
    queryFn: () =>
      fetchApi<AssetDetail>(`/assets/${encodeURIComponent(id)}`, {
        query: { locale, includeUnpublished: 'true' },
      }),
    refetchOnWindowFocus: false,
  });

  if (q.isPending) return <PageSkeleton size="2xl" />;
  if (q.error) {
    return ApiError.isApiError(q.error) && q.error.status === 404 ? (
      <NotFoundContent />
    ) : (
      <PageLoadError onRetry={() => void q.refetch()} />
    );
  }
  if (q.data.owner.id !== me.id && !me.isAdmin) return <NotFoundContent />;
  return <>{children(q.data)}</>;
}

'use client';

import { useQuery } from '@tanstack/react-query';
import { Container } from '@/components/layout/container';
import { PageSkeleton } from '@/components/layout/page-skeleton';
import { RequestSurface } from '@/components/request/request-surface';
import { useAuthedFetch } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/queries';
import type { AssetRequestListPage } from '@/lib/api/types';
import { useLogQueryError } from '@/lib/hooks/use-log-query-error';
import { useMe } from '@/preview/session/me-provider';

const EMPTY: AssetRequestListPage = { items: [], pageInfo: { nextCursor: null, hasMore: false } };

export function RequestPageClient() {
  const me = useMe();
  const fetchApi = useAuthedFetch();
  // Same key and fetcher as the surface's own list query, so the surface starts warm.
  const q = useQuery({
    queryKey: queryKeys.assetRequests({ requesterId: me.id }),
    queryFn: () => fetchApi<AssetRequestListPage>('/asset-requests', { query: { limit: 50 } }),
  });
  // A failed history load is non-fatal: the surface renders its empty state.
  useLogQueryError('request.fetch-failed', '/asset-requests', q.error);

  if (q.isPending) return <PageSkeleton size="2xl" rows={3} />;

  return (
    <Container size="2xl">
      <div className="pb-20 pt-6">
        <RequestSurface me={me} initial={(q.data ?? EMPTY).items} />
      </div>
    </Container>
  );
}

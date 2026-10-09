'use client';

import type { ReactNode } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { AdminListSkeleton } from '@/components/admin/admin-list-skeleton';
import { NotFoundContent } from '@/components/layout/not-found-content';
import { PageLoadError } from '@/components/layout/page-load-error';
import { ApiError } from '@/lib/api/errors';

/**
 * Renders an admin detail page's body from its query. Decides from `data` first, so a
 * failed BACKGROUND refetch keeps the loaded page; with no data: skeleton while pending,
 * the 404 view for a missing record, a retry view for any other failure.
 */
export function AdminQueryState<T>({
  query,
  children,
}: {
  query: Pick<UseQueryResult<T>, 'data' | 'isPending' | 'error' | 'refetch'>;
  children: (data: T) => ReactNode;
}) {
  if (query.data !== undefined) return <>{children(query.data)}</>;
  if (query.isPending) return <AdminListSkeleton rows={4} />;
  return ApiError.isApiError(query.error) && query.error.status === 404 ? (
    <NotFoundContent />
  ) : (
    <PageLoadError onRetry={() => void query.refetch()} />
  );
}

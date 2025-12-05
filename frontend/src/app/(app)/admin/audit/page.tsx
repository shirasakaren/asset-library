'use client';

import { useEffect, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { ChevronDown } from 'lucide-react';
import { AdminPageHeader } from '@/components/admin/admin-page-header';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { useAuthedFetch } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/queries';
import { useUrlState } from '@/lib/hooks/use-url-state';
import { useIntersection } from '@/lib/hooks/use-intersection';
import { formatRelative } from '@/lib/format';
import { useLocale } from 'next-intl';
import type { AdminAuditPage, AuditEntry } from '@/lib/api/admin-types';
import type { LocaleCode } from '@/lib/api/types';
import { cn } from '@/lib/utils';

export default function AdminAuditPage() {
  const fetcher = useAuthedFetch();
  const locale = useLocale() as LocaleCode;
  const { get, setParams } = useUrlState();

  const actorId = get('actorId') ?? '';
  const action = get('action') ?? '';
  const subjectType = get('subjectType') ?? '';
  const subjectId = get('subjectId') ?? '';
  const from = get('from') ?? '';
  const to = get('to') ?? '';

  const list = useInfiniteQuery({
    queryKey: queryKeys.adminAudit({ actorId, action, subjectType, subjectId, from, to }),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      fetcher<AdminAuditPage>('/admin/audit', {
        query: {
          actorId: actorId || undefined,
          action: action || undefined,
          subjectType: subjectType || undefined,
          subjectId: subjectId || undefined,
          from: from || undefined,
          to: to || undefined,
          cursor: pageParam,
          limit: 50,
        },
      }),
    getNextPageParam: (last) => (last.pageInfo.hasMore ? (last.pageInfo.nextCursor ?? undefined) : undefined),
    staleTime: 15_000,
  });
  const { ref: sentinelRef, isIntersecting } = useIntersection<HTMLDivElement>();
  useEffect(() => {
    if (isIntersecting && list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
  }, [isIntersecting, list]);

  const rows: AuditEntry[] = list.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <>
      <AdminPageHeader
        title="Audit log"
        description="Every privileged action is logged. Retention is 30 days."

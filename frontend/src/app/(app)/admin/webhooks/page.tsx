'use client';

import { useEffect, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { AdminPageHeader } from '@/components/admin/admin-page-header';
import { DataTable } from '@/components/admin/data-table';
import { Badge } from '@/components/ui/badge';
import { Modal, ModalContent, ModalHeader, ModalTitle, ModalFooter } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CodeBlock } from '@/components/ui/code-block';
import { useAuthedFetch } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/queries';
import { useIntersection } from '@/lib/hooks/use-intersection';
import { useUrlState } from '@/lib/hooks/use-url-state';
import { formatRelative } from '@/lib/format';
import { useLocale } from 'next-intl';
import type { AdminWebhookDelivery, AdminWebhookPage } from '@/lib/api/admin-types';
import type { LocaleCode } from '@/lib/api/types';

const STATUS_TONE: Record<AdminWebhookDelivery['status'], 'success' | 'danger' | 'warning'> = {
  success: 'success',
  failure: 'danger',
  pending: 'warning',
};

export default function AdminWebhooksPage() {
  const fetcher = useAuthedFetch();
  const locale = useLocale() as LocaleCode;
  const { get, setParams } = useUrlState();
  const [active, setActive] = useState<AdminWebhookDelivery | null>(null);

  const status = get('status') ?? '';
  const type = get('type') ?? '';

  const list = useInfiniteQuery({
    queryKey: queryKeys.adminWebhooks({ status, type }),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      fetcher<AdminWebhookPage>('/admin/webhook-deliveries', {
        query: {
          status: status || undefined,
          type: type || undefined,
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

  const rows = list.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <>
      <AdminPageHeader
        title="Webhook deliveries"
        description="Recent n8n webhook delivery attempts and their responses."
      />
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <select
          value={status}
          onChange={(e) => setParams({ status: e.target.value || null })}
          className="h-9 rounded-[10px] border border-line bg-surface text-[13.5px] text-ink px-3"
        >
          <option value="">Any status</option>
          <option value="success">Success</option>
          <option value="failure">Failure</option>
          <option value="pending">Pending</option>
        </select>
        <Input
          inputSize="sm"
          placeholder="Filter by type"
          value={type}
          onChange={(e) => setParams({ type: e.target.value || null })}
          className="w-[240px]"
        />
      </div>
      <DataTable
        rows={rows}
        empty="No webhook deliveries."
        onRowClick={(r) => setActive(r)}
        columns={[
          {

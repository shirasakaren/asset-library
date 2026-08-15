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
      />
      <Alert variant="neutral" className="mb-4">
        Audit logs older than 30 days are automatically purged.
      </Alert>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2 mb-4">
        <Input inputSize="sm" placeholder="Actor id" value={actorId} onChange={(e) => setParams({ actorId: e.target.value || null, cursor: null })} />
        <Input inputSize="sm" placeholder="Action (e.g. asset.publish)" value={action} onChange={(e) => setParams({ action: e.target.value || null, cursor: null })} />
        <Input inputSize="sm" placeholder="Subject type" value={subjectType} onChange={(e) => setParams({ subjectType: e.target.value || null, cursor: null })} />
        <Input inputSize="sm" placeholder="Subject id" value={subjectId} onChange={(e) => setParams({ subjectId: e.target.value || null, cursor: null })} />
        <Input inputSize="sm" type="datetime-local" value={from} onChange={(e) => setParams({ from: e.target.value || null, cursor: null })} />
        <Input inputSize="sm" type="datetime-local" value={to} onChange={(e) => setParams({ to: e.target.value || null, cursor: null })} />
      </div>

      <ul className="rounded-[14px] border border-line bg-surface overflow-hidden divide-y divide-line">
        {rows.length === 0 ? (
          <li className="p-6 text-center text-body-sm text-ink-3">No audit entries.</li>
        ) : (
          rows.map((entry) => <AuditRow key={entry.id} entry={entry} locale={locale} />)
        )}
      </ul>
      <div ref={sentinelRef} className="h-10 mt-3 text-center text-caption text-ink-3">
        {list.isFetchingNextPage ? 'Loading…' : null}
      </div>
    </>
  );
}

function AuditRow({ entry, locale }: { entry: AuditEntry; locale: LocaleCode }) {
  const [open, setOpen] = useState(false);
  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full grid grid-cols-[160px_180px_1fr_auto_24px] gap-3 items-center px-4 py-2.5 text-left text-[13px] hover:bg-surface-muted/50 transition-colors"
        aria-expanded={open}
      >
        <span className="text-caption text-ink-3 geist-tnum">{formatRelative(entry.createdAt, locale)}</span>
        <span className="text-ink-2 truncate">{entry.actorDisplayName ?? entry.actorEmail ?? 'system'}</span>
        <span className="font-mono text-[12.5px] text-ink truncate">{entry.action}</span>
        <span className="text-ink-3 text-caption truncate">
          {entry.subjectType}/{entry.subjectId}
        </span>
        <ChevronDown className={cn('h-3.5 w-3.5 text-ink-3 transition-transform', open && 'rotate-180')} strokeWidth={2.25} />
      </button>
      {open ? (
        <div className="bg-surface-muted/40 border-t border-line px-4 py-3">
          <pre className="text-[12px] leading-[1.55] font-mono whitespace-pre-wrap text-ink-2 max-h-[260px] overflow-auto">
            {JSON.stringify(entry.metadata ?? {}, null, 2)}
          </pre>
        </div>
      ) : null}
    </li>
  );
}

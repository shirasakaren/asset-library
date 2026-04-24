'use client';

import { useEffect, useMemo, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { NotificationRow } from './notification-row';
import { useAuthedFetch } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/queries';
import { useIntersection } from '@/lib/hooks/use-intersection';
import {
  markAllNotificationsReadAndBroadcast,
  markNotificationReadAndBroadcast,
} from './notification-live';
import type { NotificationItem, NotificationPage } from '@/lib/api/types';
import { cn } from '@/lib/utils';

type TabKey = 'all' | 'unread';

interface Props {
  initial: NotificationItem[];
  initialCursor: string | null;
}

export function NotificationInbox({ initial, initialCursor }: Props) {
  const t = useTranslations('notif');
  const fetcher = useAuthedFetch();
  const [tab, setTab] = useState<TabKey>('all');

  const query = useInfiniteQuery({
    queryKey: queryKeys.notificationsInbox({ unreadOnly: tab === 'unread' }),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      fetcher<NotificationPage>('/notifications', {
        query: { unreadOnly: tab === 'unread' ? 'true' : undefined, cursor: pageParam, limit: 50 },
      }),
    initialData:
      tab === 'all'
        ? {
            pages: [{ items: initial, pageInfo: { nextCursor: initialCursor, hasMore: Boolean(initialCursor) } }],
            pageParams: [undefined],
          }
        : undefined,
    getNextPageParam: (last) => (last.pageInfo.hasMore ? (last.pageInfo.nextCursor ?? undefined) : undefined),
    staleTime: 15_000,
  });

  const { ref: sentinelRef, isIntersecting } = useIntersection<HTMLDivElement>({ rootMargin: '200px' });
  useEffect(() => {
    if (isIntersecting && query.hasNextPage && !query.isFetchingNextPage) {
      void query.fetchNextPage();
    }
  }, [isIntersecting, query]);

  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  const grouped = useMemo(() => groupByDate(items), [items]);

  const handleActivate = (id: string) => {
    markNotificationReadAndBroadcast(id);
    void fetcher(`/notifications/${id}/read`, { method: 'POST' }).catch(() => undefined);
  };

  const handleMarkAll = async () => {
    markAllNotificationsReadAndBroadcast();
    await fetcher('/notifications/read-all', { method: 'POST' }).catch(() => undefined);
    void query.refetch();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-1">
          {(['all', 'unread'] as const).map((k) => {
            const active = tab === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                aria-pressed={active}
                className={cn(
                  'inline-flex items-center h-9 px-3.5 rounded-full text-[13.5px] font-medium border transition-colors',
                  active
                    ? 'bg-ink text-white border-ink'
                    : 'bg-surface text-ink-2 border-line hover:border-ink/30 hover:text-ink',
                )}
              >
                {t(`tabs.${k}` as 'tabs.all')}
              </button>
            );
          })}
        </div>
        <Button variant="ghost" onClick={handleMarkAll}>
          {t('markAll')}
        </Button>
      </div>

      {items.length === 0 ? (
        <EmptyState
          title={t('empty')}
          description={t('emptyBody')}
          seed="notifications-empty"
          pattern={false}
        />
      ) : (
        <div className="space-y-8">
          {grouped.map((group) => (
            <section key={group.key}>
              <h2 className="text-eyebrow uppercase tracking-[0.12em] text-ink-3 mb-2">
                {t(`group.${group.key}` as 'group.today')}
              </h2>
              <ul className="rounded-[14px] border border-line bg-surface overflow-hidden divide-y divide-line">
                {group.items.map((item) => (
                  <li key={item.id}>
                    <NotificationRow item={item} onActivate={handleActivate} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <div ref={sentinelRef} className="h-10 mt-6 text-center text-caption text-ink-3">
        {query.isFetchingNextPage ? '…' : null}
      </div>
    </div>
  );
}

type GroupKey = 'today' | 'yesterday' | 'thisWeek' | 'older';

function groupByDate(items: NotificationItem[]): { key: GroupKey; items: NotificationItem[] }[] {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const buckets: Record<GroupKey, NotificationItem[]> = {
    today: [],
    yesterday: [],
    thisWeek: [],
    older: [],
  };
  for (const it of items) {
    const age = now - new Date(it.createdAt).getTime();
    if (age < dayMs) buckets.today.push(it);
    else if (age < 2 * dayMs) buckets.yesterday.push(it);
    else if (age < 7 * dayMs) buckets.thisWeek.push(it);
    else buckets.older.push(it);
  }
  return (['today', 'yesterday', 'thisWeek', 'older'] as GroupKey[])
    .map((k) => ({ key: k, items: buckets[k] }))
    .filter((g) => g.items.length > 0);
}

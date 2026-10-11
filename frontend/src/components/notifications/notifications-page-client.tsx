'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Container } from '@/components/layout/container';
import { PageSkeleton } from '@/components/layout/page-skeleton';
import { NotificationInbox } from '@/components/notifications/notification-inbox';
import { useAuthedFetch } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/queries';
import type { NotificationPage } from '@/lib/api/types';
import { useLogQueryError } from '@/lib/hooks/use-log-query-error';

const EMPTY: NotificationPage = { items: [], pageInfo: { nextCursor: null, hasMore: false } };

export function NotificationsPageClient() {
  const t = useTranslations('notif');
  const fetchApi = useAuthedFetch();
  const q = useQuery({
    queryKey: queryKeys.notifications(),
    queryFn: () => fetchApi<NotificationPage>('/notifications', { query: { limit: 50 } }),
  });
  // A failed first page is non-fatal: the inbox renders its empty state.
  useLogQueryError('notifications.fetch-failed', '/notifications', q.error);

  if (q.isPending) return <PageSkeleton rows={4} />;
  const initial = q.data ?? EMPTY;

  return (
    <Container size="lg">
      <div className="pb-20 pt-6">
        <h1 className="mb-8 font-display text-display-lg tracking-[-0.02em] text-ink">
          {t('heading')}
        </h1>
        <NotificationInbox initial={initial.items} initialCursor={initial.pageInfo.nextCursor} />
      </div>
    </Container>
  );
}

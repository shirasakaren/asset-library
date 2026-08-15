import { getLocale, getTranslations } from 'next-intl/server';
import { Container } from '@/components/layout/container';
import { NotificationInbox } from '@/components/notifications/notification-inbox';
import { requireSession } from '@/lib/auth/server';
import { apiFetch } from '@/lib/api/fetcher';
import type { LocaleCode, NotificationPage } from '@/lib/api/types';

export const metadata = { title: 'Notifications' };
export const dynamic = 'force-dynamic';

export default async function NotificationsPage() {
  const session = await requireSession();
  const locale = (await getLocale()) as LocaleCode;
  const t = await getTranslations('notif');

  let initial: NotificationPage = { items: [], pageInfo: { nextCursor: null, hasMore: false } };
  try {
    initial = await apiFetch<NotificationPage>('/notifications', {
      accessToken: session.accessToken,
      locale,
      query: { limit: 50 },
      cache: 'no-store',
    });
  } catch {
    /* non-fatal */
  }

  return (
    <Container size="lg">
      <div className="pt-6 pb-20">
        <h1 className="font-display text-display-lg text-ink tracking-[-0.02em] mb-8">{t('heading')}</h1>
        <NotificationInbox initial={initial.items} initialCursor={initial.pageInfo.nextCursor} />
      </div>
    </Container>
  );
}

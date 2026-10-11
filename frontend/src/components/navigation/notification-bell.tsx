'use client';

import { useEffect, useRef, useState } from 'react';
import NextLink from 'next/link';
import { Bell } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { NotificationRow } from '@/components/notifications/notification-row';
import { markAllNotificationsReadAndBroadcast } from '@/components/notifications/notification-live';
import { useAuthedFetch } from '@/lib/api/client';
import { useNotificationsStore } from '@/lib/stores/notifications-store';
import { cn } from '@/lib/utils';

interface NotificationBellProps {
  initialUnreadCount: number;
}

const AUTO_READ_DWELL_MS = 1500;
const MAX_DROPDOWN_ITEMS = 10;

export function NotificationBell({ initialUnreadCount }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const t = useTranslations('notifications');
  const tc = useTranslations('common');
  const fetcher = useAuthedFetch();

  // Live unread count + recent list from the store seeded by <NotificationsLive />.
  // Fall back to the SSR-rendered count until the store hydrates so the badge
  // is consistent across the first paint.
  const storeUnread = useNotificationsStore((s) => s.unreadCount);
  const recent = useNotificationsStore((s) => s.recent);
  const storeReady = recent.length > 0 || storeUnread > 0;
  const unread = storeReady ? storeUnread : initialUnreadCount;

  const items = recent.slice(0, MAX_DROPDOWN_ITEMS);

  const dwellTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (dwellTimerRef.current) clearTimeout(dwellTimerRef.current);
    };
  }, []);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (dwellTimerRef.current) {
      clearTimeout(dwellTimerRef.current);
      dwellTimerRef.current = null;
    }
    if (next && unread > 0) {
      // Auto-mark-read after a short dwell so transient hovers don't clear the badge.
      dwellTimerRef.current = setTimeout(() => {
        // Optimistically zero the store + broadcast to other tabs.
        markAllNotificationsReadAndBroadcast();
        void fetcher('/notifications/read-all', { method: 'POST' }).catch(() => undefined);
      }, AUTO_READ_DWELL_MS);
    }
  };

  const handleMarkAllClick = () => {
    if (dwellTimerRef.current) {
      clearTimeout(dwellTimerRef.current);
      dwellTimerRef.current = null;
    }
    if (unread === 0) return;
    markAllNotificationsReadAndBroadcast();
    void fetcher('/notifications/read-all', { method: 'POST' }).catch(() => undefined);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={tc('openNotifications')}
          className={cn(
            'relative inline-flex h-10 w-10 items-center justify-center rounded-[12px]',
            'text-ink-2 transition-colors duration-120 hover:bg-surface-muted hover:text-ink',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2',
          )}
        >
          <Bell className="h-[18px] w-[18px]" strokeWidth={2.25} />
          {unread > 0 ? (
            <span
              aria-label={`${unread} unread`}
              className="absolute right-1.5 top-1.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-bg bg-brand-red px-1 text-[10px] font-semibold text-white"
            >
              {unread > 99 ? '99+' : unread}
            </span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[380px] overflow-hidden p-0">
        <div className="flex h-12 items-center justify-between border-b border-line px-4">
          <div className="text-[13px] font-semibold text-ink">{t('title')}</div>
          {unread > 0 ? (
            <button
              type="button"
              onClick={handleMarkAllClick}
              className="text-caption text-ink-3 transition-colors hover:text-ink"
            >
              {t('markAllRead')}
            </button>
          ) : null}
        </div>
        {items.length === 0 ? (
          <div className="p-6 text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-brand-yellow-50">
              <Bell className="h-5 w-5 text-[#a16800]" strokeWidth={2.25} />
            </div>
            <p className="text-[13.5px] font-semibold text-ink">{t('empty')}</p>
            <p className="mt-1 text-[12.5px] text-ink-3">{t('emptyBody')}</p>
          </div>
        ) : (
          <ul className="max-h-[440px] divide-y divide-line overflow-y-auto">
            {items.map((item) => (
              <li key={item.id}>
                <NotificationRow item={item} dense />
              </li>
            ))}
          </ul>
        )}
        <div className="border-t border-line p-2">
          <Button variant="ghost" fullWidth size="sm" asChild>
            <NextLink href="/notifications">{t('seeAll')}</NextLink>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

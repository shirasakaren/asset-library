'use client';

import { useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover';
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
            'text-ink-2 hover:bg-surface-muted hover:text-ink transition-colors duration-120',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2',
          )}
        >
          <Bell className="h-[18px] w-[18px]" strokeWidth={2.25} />
          {unread > 0 ? (
            <span
              aria-label={`${unread} unread`}
              className="absolute top-1.5 right-1.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand-red text-white text-[10px] font-semibold px-1 border-2 border-bg"
            >
              {unread > 99 ? '99+' : unread}
            </span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[380px] p-0 overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-4 h-12">
          <div className="text-[13px] font-semibold text-ink">{t('title')}</div>
          {unread > 0 ? (
            <button
              type="button"
              onClick={handleMarkAllClick}
              className="text-caption text-ink-3 hover:text-ink transition-colors"
            >
              {t('markAllRead')}
            </button>
          ) : null}
        </div>
        {items.length === 0 ? (
          <div className="p-6 text-center">
            <div className="mx-auto h-14 w-14 rounded-full bg-brand-yellow-50 flex items-center justify-center mb-3">
              <Bell className="h-5 w-5 text-[#a16800]" strokeWidth={2.25} />
            </div>
            <p className="text-[13.5px] font-semibold text-ink">{t('empty')}</p>
            <p className="text-[12.5px] text-ink-3 mt-1">{t('emptyBody')}</p>
          </div>
        ) : (
          <ul className="max-h-[440px] overflow-y-auto divide-y divide-line">
            {items.map((item) => (
              <li key={item.id}>
                <NotificationRow item={item} dense />
              </li>
            ))}
          </ul>
        )}
        <div className="border-t border-line p-2">
          <Button variant="ghost" fullWidth size="sm" asChild>
            <a href="/notifications">{t('seeAll')}</a>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

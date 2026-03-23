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

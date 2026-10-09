'use client';

import { useCallback, useEffect } from 'react';
import { useNotificationsStore } from '@/lib/stores/notifications-store';
import { useBroadcastChannel, broadcast, type BroadcastEvent } from '@/lib/ws/broadcast';
import { useAuthedFetch } from '@/lib/api/client';
import { logger } from '@/lib/logger';
import type { NotificationItem } from '@/lib/api/types';

/**
 * Single mount that wires:
 *  - initial fetch of unread-count + recent items into the store
 *  - BroadcastChannel cross-tab read sync
 *
 * Live updates (a new notification) arrive through the event bus and are
 * applied by `WsBootstrap`.
 */
export function NotificationsLive() {
  const fetcher = useAuthedFetch();
  const setInitial = useNotificationsStore((s) => s.setInitial);
  const markRead = useNotificationsStore((s) => s.markRead);
  const markAllRead = useNotificationsStore((s) => s.markAllRead);

  // Bootstrap from REST.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [count, page] = await Promise.all([
          fetcher<{ count: number }>('/notifications/unread-count'),
          fetcher<{ items: NotificationItem[] }>('/notifications', { query: { limit: 20 } }),
        ]);
        if (cancelled) return;
        setInitial(count.count, page.items);
      } catch (err) {
        logger.warn('notifications.bootstrap-failed', {
          err: err instanceof Error ? err.message : String(err),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetcher, setInitial]);

  // Cross-tab read sync — when this tab marks one as read, broadcast it to others.
  const onBroadcast = useCallback<(evt: BroadcastEvent) => void>(
    (evt) => {
      if (
        evt.type === 'notification.read' &&
        typeof (evt.payload as { id?: string })?.id === 'string'
      ) {
        markRead((evt.payload as { id: string }).id);
      } else if (evt.type === 'notification.read-all') {
        markAllRead();
      }
    },
    [markRead, markAllRead],
  );
  useBroadcastChannel(onBroadcast);

  return null;
}

export function markNotificationReadAndBroadcast(id: string) {
  useNotificationsStore.getState().markRead(id);
  broadcast({ type: 'notification.read', payload: { id } });
}

export function markAllNotificationsReadAndBroadcast() {
  useNotificationsStore.getState().markAllRead();
  broadcast({ type: 'notification.read-all' });
}

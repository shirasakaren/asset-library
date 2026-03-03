'use client';

import { useCallback, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNotificationsStore } from '@/lib/stores/notifications-store';
import { useWsStore } from '@/lib/ws';
import { useBroadcastChannel, broadcast, type BroadcastEvent } from '@/lib/ws/broadcast';
import { queryKeys } from '@/lib/api/queries';
import { useAuthedFetch } from '@/lib/api/client';
import { logger } from '@/lib/logger';
import type { NotificationItem } from '@/lib/api/types';

const POLL_INTERVAL_MS = 30_000;

/**
 * Single mount that wires:
 *  - initial fetch of unread-count + recent items into the store
 *  - WS handlers (notification:new / notification:read / notification:read-all)
 *  - BroadcastChannel cross-tab read sync
 *  - polling fallback for unread count when WS is closed
 */
export function NotificationsLive() {
  const fetcher = useAuthedFetch();
  const queryClient = useQueryClient();
  const setInitial = useNotificationsStore((s) => s.setInitial);
  const applyIncoming = useNotificationsStore((s) => s.applyIncoming);
  const markRead = useNotificationsStore((s) => s.markRead);
  const markAllRead = useNotificationsStore((s) => s.markAllRead);

  const subscribe = useWsStore((s) => s.subscribe);
  const wsStatus = useWsStore((s) => s.status);

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

  // WS handlers.
  useEffect(() => {
    const offs = [
      subscribe('notification:new', (msg) => {
        const env = (msg.payload ?? {}) as { type?: string; payload?: Record<string, unknown> };
        if (!env.type) return;
        applyIncoming({
          id: typeof msg.id === 'string' ? msg.id : cryptoRandomId(),
          type: env.type,
          payload: env.payload ?? {},
          readAt: null,
          createdAt: new Date().toISOString(),
        });
        void queryClient.invalidateQueries({ queryKey: queryKeys.notificationsInbox() });
      }),
      subscribe('notification:read', (msg) => {
        const p = (msg.payload ?? {}) as { id?: string };
        if (p.id) markRead(p.id);
      }),
      subscribe('notification:read-all', () => {

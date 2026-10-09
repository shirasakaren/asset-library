'use client';

import { useEffect } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { bus, type PreviewEvent } from '@/preview/events/bus';
import { useAuthedFetch } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/queries';
import { useNotificationsStore } from '@/lib/stores/notifications-store';
import { useAnalyzerStore } from '@/lib/stores/analyzer-store';
import { useWsStore } from '@/lib/ws/store';
import { logger } from '@/lib/logger';
import type { NotificationItem } from '@/lib/api/types';

type Fetcher = ReturnType<typeof useAuthedFetch>;

/** Query-key prefixes that depend on the catalog and must refresh when it changes. */
const CATALOG_PREFIXES = ['assets', 'discover', 'library', 'search', 'asset'] as const;

const COMMENT_EVENTS: Record<string, string> = {
  COMMENT_REPLY: 'comment.reply',
  COMMENT_CREATED: 'comment.created',
  ISSUE_CREATED: 'comment.created',
};

/**
 * A new comment notification also tells an open comment thread of that asset about it
 * (`CommentsSection` then offers "N new comments"), like the old socket's comment frames.
 */
function announceComment(item: NotificationItem) {
  const type = COMMENT_EVENTS[item.type];
  if (!type || typeof item.payload.assetId !== 'string') return;
  useWsStore.getState().dispatch({ type, id: item.id, payload: item.payload });
}

async function refreshNotifications(fetcher: Fetcher, notificationId: string) {
  try {
    const [count, page] = await Promise.all([
      fetcher<{ count: number }>('/notifications/unread-count'),
      fetcher<{ items: NotificationItem[] }>('/notifications', { query: { limit: 20 } }),
    ]);
    const item = page.items.find((n) => n.id === notificationId);
    if (item) {
      const store = useNotificationsStore.getState();
      // The same event also announces "this one was read" (and read-all), so only an
      // unread item the store has not seen yet counts as a new notification.
      const isNew = !item.readAt && !store.recent.some((n) => n.id === item.id);
      store.applyIncoming(item);
      if (isNew) {
        // Same envelope the old `notification:new` socket frame carried, for
        // subscribers (e.g. the library "new version" badge) that listen on it.
        useWsStore.getState().dispatch({
          type: 'notification:new',
          id: item.id,
          payload: { type: item.type, payload: item.payload },
        });
        announceComment(item);
      }
    }
    useNotificationsStore.setState({ unreadCount: count.count });
  } catch (err) {
    logger.warn('notifications.refresh-failed', {
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

function handleEvent(e: PreviewEvent, queryClient: QueryClient, fetcher: Fetcher) {
  switch (e.type) {
    case 'notification':
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      void queryClient.invalidateQueries({ queryKey: ['notifications-inbox'] });
      void refreshNotifications(fetcher, e.notificationId);
      return;
    case 'version.ready':
      useAnalyzerStore.getState().applyAnalyzeReady(e.versionId);
      void queryClient.invalidateQueries({ queryKey: queryKeys.assetVersions(e.assetId) });
      // Detail queries are keyed by id *or slug*, so refresh the whole prefix.
      void queryClient.invalidateQueries({ queryKey: ['asset'] });
      return;
    case 'assets.changed':
      for (const prefix of CATALOG_PREFIXES) {
        void queryClient.invalidateQueries({ queryKey: [prefix] });
      }
      return;
  }
}

/**
 * Single mount point that replaces the WebSocket: subscribes to the in-browser
 * event bus and applies the same store / query-cache updates the socket
 * handlers used to. Rendered once inside the app shell.
 */
export function WsBootstrap() {
  const queryClient = useQueryClient();
  const fetcher = useAuthedFetch();

  useEffect(() => bus.on((e) => handleEvent(e, queryClient, fetcher)), [queryClient, fetcher]);
  return null;
}

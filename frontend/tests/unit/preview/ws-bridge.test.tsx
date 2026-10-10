import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { NotificationItem } from '@/lib/api/types';

const apiFetch = vi.fn();
vi.mock('@/lib/api/fetcher', () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }));

import { WsBootstrap } from '@/components/navigation/ws-bootstrap';
import { bus } from '@/preview/events/bus';
import { useNotificationsStore } from '@/lib/stores/notifications-store';
import { useAnalyzerStore } from '@/lib/stores/analyzer-store';
import { useWsStore } from '@/lib/ws';

const item = {
  id: 'n1',
  type: 'VERSION_PUBLISHED',
  payload: { assetId: 'a1' },
  readAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
} as unknown as NotificationItem;

function setup() {
  const qc = new QueryClient();
  const spy = vi.spyOn(qc, 'invalidateQueries');
  const view = render(
    <QueryClientProvider client={qc}>
      <WsBootstrap />
    </QueryClientProvider>,
  );
  const keys = () => spy.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey);
  return { qc, spy, keys, ...view };
}

beforeEach(() => {
  apiFetch.mockReset();
  useNotificationsStore.setState({ unreadCount: 0, recent: [] });
  useAnalyzerStore.setState({ versions: {} });
});

describe('WsBootstrap (event bus bridge)', () => {
  it('notification: invalidates notifications keys and updates the notifications store', async () => {
    apiFetch.mockImplementation(async (path: string) =>
      path === '/notifications/unread-count' ? { count: 4 } : { items: [item] },
    );
    const received: unknown[] = [];
    const off = useWsStore.getState().subscribe('notification:new', (m) => received.push(m));
    const { keys } = setup();

    bus.emit({ type: 'notification', notificationId: 'n1' });

    expect(keys()).toContainEqual(['notifications']);
    expect(keys()).toContainEqual(['notifications-inbox']);
    await waitFor(() => expect(useNotificationsStore.getState().recent[0]?.id).toBe('n1'));
    await waitFor(() => expect(useNotificationsStore.getState().unreadCount).toBe(4));
    expect(received).toHaveLength(1);
    expect((received[0] as { payload: { type: string } }).payload.type).toBe('VERSION_PUBLISHED');
    off();
  });

  it.each([
    ['COMMENT_REPLY', 'comment.reply'],
    ['COMMENT_CREATED', 'comment.created'],
    ['ISSUE_CREATED', 'comment.created'],
  ])('notification: a new %s also raises %s for the thread of that asset', async (type, wsType) => {
    const n = { ...item, id: 'n9', type, payload: { assetId: 'a7', commentId: 'c-1' } };
    apiFetch.mockImplementation(async (path: string) =>
      path === '/notifications/unread-count' ? { count: 1 } : { items: [n] },
    );
    const received: unknown[] = [];
    const off = useWsStore.getState().subscribe(wsType, (m) => received.push(m.payload));
    setup();

    bus.emit({ type: 'notification', notificationId: 'n9' });

    await waitFor(() => expect(received).toEqual([{ assetId: 'a7', commentId: 'c-1' }]));
    off();
  });

  it('notification: other notification types do not raise comment events', async () => {
    apiFetch.mockImplementation(async (path: string) =>
      path === '/notifications/unread-count' ? { count: 1 } : { items: [item] },
    );
    const received: unknown[] = [];
    const offs = ['comment.reply', 'comment.created'].map((t) =>
      useWsStore.getState().subscribe(t, (m) => received.push(m)),
    );
    setup();
    bus.emit({ type: 'notification', notificationId: 'n1' });
    await waitFor(() => expect(useNotificationsStore.getState().recent[0]?.id).toBe('n1'));
    expect(received).toHaveLength(0);
    offs.forEach((off) => off());
  });

  it('notification: an event for an item that was only marked read is not announced as new', async () => {
    const read = { ...item, readAt: '2026-01-02T00:00:00.000Z' } as NotificationItem;
    apiFetch.mockImplementation(async (path: string) =>
      path === '/notifications/unread-count' ? { count: 0 } : { items: [read] },
    );
    const received: unknown[] = [];
    const off = useWsStore.getState().subscribe('notification:new', (m) => received.push(m));
    setup();

    bus.emit({ type: 'notification', notificationId: 'n1' });

    await waitFor(() => expect(useNotificationsStore.getState().unreadCount).toBe(0));
    expect(received).toHaveLength(0);
    off();
  });

  it('notification: an unread item the store already knows is not announced a second time', async () => {
    useNotificationsStore.setState({ unreadCount: 1, recent: [item] });
    apiFetch.mockImplementation(async (path: string) =>
      path === '/notifications/unread-count' ? { count: 1 } : { items: [item] },
    );
    const received: unknown[] = [];
    const off = useWsStore.getState().subscribe('notification:new', (m) => received.push(m));
    setup();

    bus.emit({ type: 'notification', notificationId: 'n1' });

    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
    await new Promise((r) => setTimeout(r, 20));
    expect(received).toHaveLength(0);
    expect(useNotificationsStore.getState().recent).toHaveLength(1);
    off();
  });

  it('notification: an empty id (bulk read) only refreshes the counters', async () => {
    useNotificationsStore.setState({ unreadCount: 3, recent: [item] });
    apiFetch.mockImplementation(async (path: string) =>
      path === '/notifications/unread-count' ? { count: 0 } : { items: [item] },
    );
    const received: unknown[] = [];
    const off = useWsStore.getState().subscribe('notification:new', (m) => received.push(m));
    setup();

    bus.emit({ type: 'notification', notificationId: '' });

    await waitFor(() => expect(useNotificationsStore.getState().unreadCount).toBe(0));
    expect(received).toHaveLength(0);
    off();
  });

  it('notification: a failing refresh does not throw and still invalidates', async () => {
    apiFetch.mockRejectedValue(new Error('down'));
    const log = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { keys } = setup();
    bus.emit({ type: 'notification', notificationId: 'n1' });
    expect(keys()).toContainEqual(['notifications']);
    await waitFor(() => expect(log).toHaveBeenCalled());
    log.mockRestore();
  });

  it('version.ready: marks the version READY and invalidates asset keys', () => {
    const { keys } = setup();
    bus.emit({ type: 'version.ready', assetId: 'a1', versionId: 'v1' });
    expect(useAnalyzerStore.getState().versions['v1']?.analysisStatus).toBe('READY');
    expect(keys()).toContainEqual(['asset']);
    expect(keys()).toContainEqual(['asset', 'a1', 'versions']);
  });

  it('assets.changed: invalidates the catalog prefixes (assets, discover, library, search, asset) and the reference lists admins edit', () => {
    const { keys } = setup();
    bus.emit({ type: 'assets.changed' });
    for (const p of [
      'assets',
      'discover',
      'library',
      'search',
      'asset',
      'categories',
      'licenses',
      'tags',
    ]) {
      expect(keys()).toContainEqual([p]);
    }
  });

  it('stops listening on unmount', () => {
    const { keys, unmount } = setup();
    unmount();
    bus.emit({ type: 'assets.changed' });
    expect(keys()).toHaveLength(0);
  });
});

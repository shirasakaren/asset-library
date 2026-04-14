import { describe, it, expect, beforeEach } from 'vitest';
import { useNotificationsStore } from '@/lib/stores/notifications-store';
import type { NotificationItem } from '@/lib/api/types';

function mk(id: string, readAt: string | null = null): NotificationItem {
  return {
    id,
    type: 'COMMENT_CREATED',
    payload: {},
    readAt,
    createdAt: new Date().toISOString(),
  };
}

describe('notificationsStore', () => {
  beforeEach(() => useNotificationsStore.setState({ unreadCount: 0, recent: [] }));

  it('prepends new unread items and increments the count', () => {
    useNotificationsStore.getState().applyIncoming(mk('a'));
    useNotificationsStore.getState().applyIncoming(mk('b'));
    expect(useNotificationsStore.getState().recent.map((n) => n.id)).toEqual(['b', 'a']);
    expect(useNotificationsStore.getState().unreadCount).toBe(2);
  });

  it('does not double-insert the same id', () => {
    useNotificationsStore.getState().applyIncoming(mk('a'));
    useNotificationsStore.getState().applyIncoming(mk('a'));
    expect(useNotificationsStore.getState().unreadCount).toBe(1);
    expect(useNotificationsStore.getState().recent).toHaveLength(1);
  });

  it('markRead decrements unread count and stamps readAt', () => {
    useNotificationsStore.getState().applyIncoming(mk('a'));
    useNotificationsStore.getState().markRead('a');
    expect(useNotificationsStore.getState().unreadCount).toBe(0);
    expect(useNotificationsStore.getState().recent[0]?.readAt).not.toBeNull();
  });

  it('markAllRead zeros the count and stamps all readAts', () => {
    useNotificationsStore.getState().applyIncoming(mk('a'));
    useNotificationsStore.getState().applyIncoming(mk('b'));
    useNotificationsStore.getState().markAllRead();
    expect(useNotificationsStore.getState().unreadCount).toBe(0);
    for (const n of useNotificationsStore.getState().recent) {
      expect(n.readAt).not.toBeNull();
    }
  });
});

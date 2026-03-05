'use client';

import { create } from 'zustand';
import type { NotificationItem } from '@/lib/api/types';

interface NotificationsState {
  unreadCount: number;
  /** Most recent 50 notifications cached for the bell dropdown. */
  recent: NotificationItem[];
  setInitial: (unreadCount: number, recent: NotificationItem[]) => void;
  applyIncoming: (item: NotificationItem) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  decrementUnread: () => void;
}

export const useNotificationsStore = create<NotificationsState>((set) => ({
  unreadCount: 0,
  recent: [],
  setInitial: (unreadCount, recent) => set({ unreadCount, recent }),
  applyIncoming: (item) =>
    set((s) => {
      if (s.recent.some((n) => n.id === item.id)) return s;
      return {
        unreadCount: s.unreadCount + (item.readAt ? 0 : 1),
        recent: [item, ...s.recent].slice(0, 50),
      };
    }),
  markRead: (id) =>
    set((s) => {
      const target = s.recent.find((n) => n.id === id);
      if (!target || target.readAt) return s;
      const nowIso = new Date().toISOString();
      return {
        unreadCount: Math.max(0, s.unreadCount - 1),
        recent: s.recent.map((n) => (n.id === id ? { ...n, readAt: nowIso } : n)),
      };
    }),
  markAllRead: () =>
    set((s) => {
      const nowIso = new Date().toISOString();
      return {
        unreadCount: 0,
        recent: s.recent.map((n) => (n.readAt ? n : { ...n, readAt: nowIso })),
      };
    }),
  decrementUnread: () =>
    set((s) => ({ unreadCount: Math.max(0, s.unreadCount - 1) })),
}));

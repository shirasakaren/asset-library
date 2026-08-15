'use client';

import { create } from 'zustand';

export type WsStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'reconnecting';

export interface WsMessage {
  type: string;
  id?: string;
  ts?: number;
  payload?: unknown;
}

type Handler = (msg: WsMessage) => void;

interface WsState {
  status: WsStatus;
  lastMessage: WsMessage | null;
  lastError: string | null;
  reconnectAttempts: number;
  handlers: Map<string, Set<Handler>>;
  setStatus: (s: WsStatus) => void;
  setError: (e: string | null) => void;
  bumpAttempts: () => void;
  resetAttempts: () => void;
  dispatch: (msg: WsMessage) => void;
  subscribe: (type: string, handler: Handler) => () => void;
}

export const useWsStore = create<WsState>((set, get) => ({
  status: 'idle',
  lastMessage: null,
  lastError: null,
  reconnectAttempts: 0,
  handlers: new Map(),
  setStatus: (status) => set({ status }),
  setError: (lastError) => set({ lastError }),
  bumpAttempts: () => set((s) => ({ reconnectAttempts: s.reconnectAttempts + 1 })),
  resetAttempts: () => set({ reconnectAttempts: 0 }),
  dispatch: (msg) => {
    set({ lastMessage: msg });
    const bucket = get().handlers.get(msg.type);
    if (!bucket) return;
    for (const handler of bucket) handler(msg);
  },
  subscribe: (type, handler) => {
    const handlers = get().handlers;
    let bucket = handlers.get(type);
    if (!bucket) {
      bucket = new Set();
      handlers.set(type, bucket);
    }
    bucket.add(handler);
    return () => {
      bucket?.delete(handler);
      if (bucket && bucket.size === 0) handlers.delete(type);
    };
  },
}));

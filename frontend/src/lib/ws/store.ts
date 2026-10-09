'use client';

import { create } from 'zustand';

export interface WsMessage {
  type: string;
  id?: string;
  ts?: number;
  payload?: unknown;
}

type Handler = (msg: WsMessage) => void;

interface WsState {
  lastMessage: WsMessage | null;
  handlers: Map<string, Set<Handler>>;
  dispatch: (msg: WsMessage) => void;
  subscribe: (type: string, handler: Handler) => () => void;
}

/**
 * In-process fan-out of server-style messages to typed handlers. There is no
 * socket any more: `WsBootstrap` translates event-bus events into messages here.
 */
export const useWsStore = create<WsState>((set, get) => ({
  lastMessage: null,
  handlers: new Map(),
  dispatch: (msg) => {
    set({ lastMessage: msg });
    const bucket = get().handlers.get(msg.type);
    if (!bucket) return;
    for (const handler of [...bucket]) handler(msg);
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

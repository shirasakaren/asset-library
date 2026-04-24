'use client';

import { useEffect } from 'react';

const CHANNEL = 'mgm-asset-library';

export interface BroadcastEvent<T = unknown> {
  type: string;
  payload?: T;
}

/**
 * Lightweight cross-tab pub/sub built on BroadcastChannel. Used for shared
 * client state (notification counts, sign-out) so all open tabs stay in
 * sync without each opening their own polling loop.
 */
export function useBroadcastChannel(handler: (event: BroadcastEvent) => void) {
  useEffect(() => {
    if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = (ev) => {
      const data = ev.data as BroadcastEvent;
      if (data && typeof data.type === 'string') handler(data);
    };
    return () => channel.close();
  }, [handler]);
}

export function broadcast<T>(event: BroadcastEvent<T>) {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return;
  const channel = new BroadcastChannel(CHANNEL);
  channel.postMessage(event);
  channel.close();
}

'use client';

import { useEffect, useState } from 'react';
import { useWebSocket } from '@/lib/ws/use-websocket';

interface Props {
  token: string | null;
}

type IdleWindow = {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  cancelIdleCallback?: (id: number) => void;
};

/**
 * Single mount point for the WebSocket connection. Rendered once
 * inside the AppShell so the connection follows the user for the
 * lifetime of their authenticated session.
 *
 * The connect is deferred until after first paint (via `requestIdleCallback`,
 * with a `setTimeout` fallback) so the socket handshake doesn't compete with
 * the initial route load. `useWebSocket` only opens the socket once `enabled`
 * is true.
 */
export function WsBootstrap({ token }: Props) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const idleWindow = window as unknown as IdleWindow;
    const ric = idleWindow.requestIdleCallback;
    if (ric) {
      const id = ric(() => setReady(true), { timeout: 3000 });
      return () => idleWindow.cancelIdleCallback?.(id);
    }
    const t = setTimeout(() => setReady(true), 1200);
    return () => clearTimeout(t);
  }, []);

  useWebSocket({ token, enabled: ready && Boolean(token) });
  return null;
}

'use client';

import { useEffect, useRef } from 'react';
import { publicEnv } from '@/lib/env.public';
import { logger } from '@/lib/logger';
import { useWsStore } from './store';

interface UseWebSocketOptions {
  token?: string | null;
  enabled?: boolean;
}

const BASE_DELAY_MS = 1_000;
const MAX_DELAY_MS = 16_000;
const JITTER = 0.25;
const MAX_QUIET_MS = 90_000;

function computeBackoff(attempt: number): number {
  const exp = Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS);
  const jitter = exp * JITTER * (Math.random() * 2 - 1);
  return Math.max(250, Math.round(exp + jitter));
}

/**
 * Opens a single WebSocket per consuming mount. The store fan-outs messages
 * to typed handlers registered via `useWsStore.subscribe('type', fn)`.
 * Mount once at the top of the auth shell.
 */
export function useWebSocket({ token, enabled = true }: UseWebSocketOptions) {
  const setStatus = useWsStore((s) => s.setStatus);
  const setError = useWsStore((s) => s.setError);
  const bumpAttempts = useWsStore((s) => s.bumpAttempts);
  const resetAttempts = useWsStore((s) => s.resetAttempts);
  const dispatch = useWsStore((s) => s.dispatch);

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const livenessTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopped = useRef(false);

  useEffect(() => {
    if (!enabled || !token) return;
    stopped.current = false;

    const baseUrl = publicEnv.NEXT_PUBLIC_WS_URL;
    const url = `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;

    const resetLiveness = () => {
      if (livenessTimer.current) clearTimeout(livenessTimer.current);
      livenessTimer.current = setTimeout(() => {
        logger.warn('ws:liveness-timeout');
        socketRef.current?.close(1011, 'liveness-timeout');
      }, MAX_QUIET_MS);
    };

    const connect = () => {
      if (stopped.current) return;
      const attempts = useWsStore.getState().reconnectAttempts;
      setStatus(attempts > 0 ? 'reconnecting' : 'connecting');
      logger.info('ws:connecting', { url: baseUrl, attempts });
      let ws: WebSocket;
      try {
        ws = new WebSocket(url);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        scheduleReconnect();
        return;
      }
      socketRef.current = ws;

      ws.onopen = () => {
        setStatus('open');
        setError(null);
        resetAttempts();
        resetLiveness();
        logger.info('ws:open');
      };

      ws.onmessage = (ev) => {
        resetLiveness();
        try {
          const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : '');
          if (msg && typeof msg.type === 'string') {
            dispatch(msg);
          }
        } catch {
          /* ignore non-JSON frames */
        }
      };

      ws.onerror = () => {
        setError('socket-error');
        logger.warn('ws:error');
      };

      ws.onclose = (ev) => {
        setStatus('closed');
        logger.info('ws:close', { code: ev.code, reason: ev.reason });
        if (livenessTimer.current) clearTimeout(livenessTimer.current);
        if (stopped.current) return;
        if (ev.code === 4401) {
          setError('unauthenticated');
          return;
        }
        scheduleReconnect();
      };
    };

    const scheduleReconnect = () => {
      if (stopped.current) return;
      const attempts = useWsStore.getState().reconnectAttempts;
      const delay = computeBackoff(attempts);
      bumpAttempts();
      logger.info('ws:reconnect-scheduled', { delay, attempts });
      reconnectTimer.current = setTimeout(connect, delay);
    };

    connect();

    return () => {
      stopped.current = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (livenessTimer.current) clearTimeout(livenessTimer.current);
      socketRef.current?.close(1000, 'unmount');
      socketRef.current = null;
    };
  }, [token, enabled, setStatus, setError, bumpAttempts, resetAttempts, dispatch]);
}

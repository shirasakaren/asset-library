'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Loader2 } from 'lucide-react';
import { apiFetch } from '@/lib/api/fetcher';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toaster';
import type { MeResponse } from '@/lib/api/types';

interface MeContextValue {
  me: MeResponse;
  /** Re-load `GET /auth/me` (e.g. after a profile/locale change). Resolves once applied. */
  refetch: () => Promise<void>;
}

const MeContext = createContext<MeContextValue | null>(null);

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; me: MeResponse };

/**
 * Loads the demo persona from the in-browser backend and renders children only
 * once it is available, so every consumer can call `useMe()` synchronously.
 */
export function MeProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const seq = useRef(0);

  const load = useCallback(async (opts: { silent: boolean }) => {
    const mine = ++seq.current;
    if (!opts.silent) setState({ status: 'loading' });
    try {
      const me = await apiFetch<MeResponse>('/auth/me');
      if (mine === seq.current) setState({ status: 'ready', me });
    } catch (err) {
      console.error('[preview] failed to load /auth/me', err);
      if (mine !== seq.current) return;
      // A failed silent refresh keeps the previous persona on screen.
      setState((prev) =>
        opts.silent && prev.status === 'ready'
          ? prev
          : { status: 'error', message: err instanceof Error ? err.message : String(err) },
      );
    }
  }, []);

  useEffect(() => {
    void load({ silent: false });
    return () => {
      seq.current += 1; // drop any in-flight result after unmount
    };
  }, [load]);

  const refetch = useCallback(() => load({ silent: true }), [load]);

  const value = useMemo<MeContextValue | null>(
    () => (state.status === 'ready' ? { me: state.me, refetch } : null),
    [state, refetch],
  );

  if (state.status === 'ready' && value) {
    return <MeContext.Provider value={value}>{children}</MeContext.Provider>;
  }

  if (state.status === 'error') {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg p-6">
        <div
          role="alert"
          className="max-w-sm rounded-[14px] border border-line bg-surface p-6 text-center shadow-2"
        >
          <h1 className="text-[16px] font-semibold text-ink">Could not load the demo</h1>
          <p className="mt-2 text-[13.5px] text-ink-2">
            Something went wrong while starting the preview session.
          </p>
          <p className="mt-1 break-words font-mono text-[12px] text-ink-3">{state.message}</p>
          <Button className="mt-4" onClick={() => void load({ silent: false })}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-label="Loading"
      className="flex min-h-dvh items-center justify-center bg-bg"
    >
      <Loader2 className="h-6 w-6 animate-spin text-ink-3" aria-hidden="true" />
    </div>
  );
}

function useMeContext(): MeContextValue {
  const ctx = useContext(MeContext);
  if (!ctx) throw new Error('useMe must be used within <MeProvider>');
  return ctx;
}

/** The signed-in demo persona. Throws outside `<MeProvider>`. */
export function useMe(): MeResponse {
  return useMeContext().me;
}

/** Re-fetch `/auth/me` and update every `useMe()` consumer. */
export function useRefetchMe(): () => Promise<void> {
  return useMeContext().refetch;
}

export interface PreviewSession {
  data: { accessToken: 'preview'; user: MeResponse; expiresAt?: number };
  status: 'authenticated';
}

/**
 * Drop-in replacement for `next-auth/react`'s `useSession` as read by this
 * codebase (`session.accessToken`). Always authenticated; the token is a
 * placeholder because the preview backend never checks it.
 */
export function useSession(): PreviewSession {
  const me = useMe();
  return useMemo<PreviewSession>(
    () => ({ data: { accessToken: 'preview', user: me }, status: 'authenticated' }),
    [me],
  );
}

/** Stand-in for `next-auth/react`'s `getSession()`; resolves to the static placeholder token. */
export async function getPreviewAccessToken(): Promise<'preview'> {
  return 'preview';
}

/** Stand-in for `next-auth/react`'s `signOut()`: there is no session to end in the preview. */
export async function signOut(_opts?: { callbackUrl?: string }): Promise<void> {
  toast.info('Preview mode: sign-out is disabled');
}

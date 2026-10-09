import { previewFetch } from '@/preview';

type QueryPrimitive = string | number | boolean;
type QueryValue = QueryPrimitive | QueryPrimitive[] | undefined | null;

export interface ApiFetchInit extends Omit<RequestInit, 'body'> {
  body?: unknown;
  locale?: 'en' | 'id';
  /** Ignored by the static preview (no auth); kept so existing call sites compile. */
  accessToken?: string;
  /** Ignored by the static preview; kept so existing call sites compile. */
  idempotencyKey?: string;
  query?: Record<string, QueryValue>;
  /** Ignored by the static preview (no auth); kept so existing call sites compile. */
  tokenRefresher?: () => Promise<string | undefined>;
}

/**
 * Static-preview transport: every request is served by the in-browser mock
 * backend (`@/preview`) instead of the network.
 */
export async function apiFetch<T = unknown>(path: string, init: ApiFetchInit = {}): Promise<T> {
  return previewFetch<T>(path, {
    method: init.method,
    query: init.query,
    body: init.body,
    locale: init.locale,
  });
}

import { publicEnv } from '@/lib/env.public';
import { ApiError, type ProblemDetail } from './errors';
import { addBreadcrumb } from '@/lib/sentry';

type QueryPrimitive = string | number | boolean;
type QueryValue = QueryPrimitive | QueryPrimitive[] | undefined | null;

export interface ApiFetchInit extends Omit<RequestInit, 'body'> {
  body?: unknown;
  locale?: 'en' | 'id';
  accessToken?: string;
  idempotencyKey?: string;
  query?: Record<string, QueryValue>;
  /**
   * Optional async getter for a fresh access token. When a request returns 401
   * and a refresher is supplied, the fetcher calls it once and retries with the
   * returned token. Caps at one retry to avoid loops on a truly bad refresh
   * token. Set this when the caller can't guarantee the token in `accessToken`
   * is current — e.g. background uploads that span a token's lifetime.
   */
  tokenRefresher?: () => Promise<string | undefined>;
}

function buildUrl(path: string, query?: ApiFetchInit['query']): string {
  const base = publicEnv.NEXT_PUBLIC_API_URL.replace(/\/$/, '');
  const url = new URL(path.startsWith('/') ? `${base}${path}` : `${base}/${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null || v === '') continue;
      if (Array.isArray(v)) {
        // Repeat the param per value — the OpenAPI default for array
        // schemas. The backend's `asArray` transform also accepts
        // comma-separated, so either form would land correctly.
        for (const item of v) {
          if (item === undefined || item === null || item === '') continue;
          url.searchParams.append(k, String(item));
        }
        continue;
      }
      url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

function newRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export async function apiFetch<T = unknown>(path: string, init: ApiFetchInit = {}): Promise<T> {
  const { body, locale, accessToken, idempotencyKey, query, headers, tokenRefresher, ...rest } =
    init;
  const url = buildUrl(path, query);

  // One round-trip with a specific Bearer. Factored so we can run it twice when
  // a 401 + tokenRefresher case lets us refresh the access token and retry.
  const doRequest = async (token: string | undefined): Promise<Response> => {
    const requestId = newRequestId();
    const finalHeaders: Record<string, string> = {
      Accept: 'application/json',
      'X-Request-Id': requestId,
      ...(headers as Record<string, string> | undefined),
    };
    // Only advertise a JSON body when we actually send one. Fastify rejects a
    // request that has `Content-Type: application/json` but an empty body
    // ("Body cannot be empty…"), which broke every no-body POST (archive,
    // restore, delete, publish, etc.).
    if (body !== undefined && !('Content-Type' in finalHeaders)) {
      finalHeaders['Content-Type'] = 'application/json';
    }
    if (locale) finalHeaders['Accept-Language'] = locale;
    if (token) finalHeaders['Authorization'] = `Bearer ${token}`;
    if (idempotencyKey) finalHeaders['Idempotency-Key'] = idempotencyKey;

    const startedAt = Date.now();
    let response: Response;
    try {
      response = await fetch(url, {
        ...rest,
        headers: finalHeaders,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (err) {
      void addBreadcrumb('api:network-error', { url, requestId });
      throw new ApiError(
        {
          type: 'about:blank',
          title: 'NetworkError',
          status: 0,
          code: 'network.error',
          detail: err instanceof Error ? err.message : String(err),
        },
        requestId,
      );
    }
    void addBreadcrumb('api:response', {
      url,
      status: response.status,
      elapsedMs: Date.now() - startedAt,
      requestId,
    });
    (response as Response & { __requestId?: string }).__requestId = requestId;
    return response;
  };

  let response = await doRequest(accessToken);

  // 401 retry-once: a long-running flow (e.g. a 300 MB upload) can outlive the
  // Keycloak access-token TTL even with periodic session polling, because the
  // upload's `complete` call can land microseconds after expiry. When the
  // caller supplied a refresher, force a session refetch and try once more.
  // Capped at one retry so a bad refresh token can't infinite-loop.
  if (response.status === 401 && tokenRefresher) {
    const refreshed = await tokenRefresher().catch(() => undefined);
    if (refreshed && refreshed !== accessToken) {
      response = await doRequest(refreshed);
    }
  }

  const requestId = (response as Response & { __requestId?: string }).__requestId ?? newRequestId();

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  const parsed = text ? safeJsonParse(text) : null;

  if (!response.ok) {
    const problem: ProblemDetail =
      parsed && isProblem(parsed)
        ? parsed
        : {
            type: 'about:blank',
            title: response.statusText || 'Error',
            status: response.status,
            code: response.status === 401 ? 'auth.unauthenticated' : 'http.error',
            detail:
              typeof parsed === 'object' && parsed && 'message' in parsed
                ? String((parsed as { message: unknown }).message)
                : undefined,
          };
    throw new ApiError(problem, requestId);
  }

  return parsed as T;
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function isProblem(value: unknown): value is ProblemDetail {
  return (
    typeof value === 'object' &&
    value !== null &&
    'status' in value &&
    'code' in value &&
    'title' in value
  );
}

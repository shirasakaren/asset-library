import type { Db } from '../types';
import type { PreviewEvent } from '../events/bus';
import { ApiError } from '@/lib/api/errors';
import { internalError, notFound } from './errors';

export interface PreviewRequest {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  params: Record<string, string>;
  query: URLSearchParams;
  body: unknown;
  locale: 'en' | 'id';
}

export interface PreviewContext {
  db: Db;
  /** current persona id */
  meId: string;
  now(): Date;
  /** `${prefix}-<session counter><random>` */
  newId(prefix: string): string;
  emit(e: PreviewEvent): void;
  /**
   * When false, handlers must not schedule simulated background work
   * (processing timers etc.). Tests can set this to false for determinism.
   */
  timers: boolean;
}

export type Handler = (req: PreviewRequest, ctx: PreviewContext) => unknown | Promise<unknown>;

interface Route {
  method: PreviewRequest['method'];
  regex: RegExp;
  names: string[];
  handler: Handler;
}

const routes: Route[] = [];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function compile(pattern: string): { regex: RegExp; names: string[] } {
  const names: string[] = [];
  const src = pattern
    .split('/')
    .map((seg) => {
      const m = /^\{(\w+)\}$/.exec(seg) ?? /^:(\w+)$/.exec(seg);
      if (m) {
        names.push(m[1]!);
        return '([^/]+)';
      }
      return escapeRe(seg);
    })
    .join('/');
  return { regex: new RegExp(`^${src}$`), names };
}

/** Register a handler. First match wins, so register specific routes before parameterized ones. */
export function route(method: PreviewRequest['method'], pattern: string, handler: Handler): void {
  const { regex, names } = compile(pattern);
  routes.push({ method, regex, names, handler });
}

const safeDecode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

export async function dispatch(
  req: Omit<PreviewRequest, 'params'>,
  ctx: PreviewContext,
): Promise<unknown> {
  const path = req.path.length > 1 ? req.path.replace(/\/+$/, '') : req.path;
  for (const r of routes) {
    if (r.method !== req.method) continue;
    const m = r.regex.exec(path);
    if (!m) continue;
    const params: Record<string, string> = {};
    r.names.forEach((n, i) => {
      params[n] = safeDecode(m[i + 1]!);
    });
    try {
      return await r.handler({ ...req, path, params }, ctx);
    } catch (e) {
      if (ApiError.isApiError(e)) throw e;
      console.error('[preview] handler failed', req.method, path, e);
      throw internalError(e instanceof Error ? e.message : String(e));
    }
  }
  throw notFound(`No preview handler for ${req.method} ${path}`);
}

import type { Db } from './types';
import { createDb } from './store/db';
import { createIdbOverlay } from './store/overlay';
import { createSeedSource } from './store/seed-source';
import { SEED_ANCHOR, SEED_VERSION } from './store/version';
import { dispatch, type PreviewContext, type PreviewRequest } from './router/router';
import { createContext } from './router/context';
import { internalError } from './router/errors';
import { toSearchParams } from './router/query';
import { ApiError } from '@/lib/api/errors';
import { getBlobStore } from './uploads/blob-store';
import { clearObjectUrls } from './uploads/blob-url';
import './handlers';

let dbPromise: Promise<Db> | null = null;

/** Lazily-built singleton db (IndexedDB overlay over the static seed; in-memory on failure). */
export function getDb(): Promise<Db> {
  if (!dbPromise) {
    dbPromise = createDb({
      seed: createSeedSource(),
      overlay: createIdbOverlay(),
      seedVersion: SEED_VERSION,
      // The seed moves with the visitor's clock: one stable offset per visitor (see store/rebase.ts).
      rebase: { anchor: SEED_ANCHOR, now: () => new Date() },
    }).catch((e) => {
      dbPromise = null;
      throw e;
    });
  }
  return dbPromise;
}

/**
 * Wipes the visitor's changes: the record overlay AND every uploaded blob (they live in a
 * separate IndexedDB, `mgm-preview-blobs`), and revokes the `blob:` download URLs handed out so far.
 */
export async function resetDemo(): Promise<void> {
  const db = await getDb();
  await db.reset();
  await getBlobStore().clear();
  clearObjectUrls();
}

let ctxPromise: Promise<PreviewContext> | null = null;
const getContext = (): Promise<PreviewContext> => {
  if (!ctxPromise) {
    ctxPromise = getDb().then((db) => createContext(db));
    ctxPromise.catch(() => {
      ctxPromise = null;
    });
  }
  return ctxPromise;
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Handlers must return JSON-shaped values (no Date/Map/Set/functions) so results
 * match what the real API would send over the wire; results are structuredClone'd.
 */
export async function previewFetch<T>(
  path: string,
  init: {
    method?: string;
    query?: Record<string, unknown>;
    body?: unknown;
    locale?: 'en' | 'id';
  } = {},
): Promise<T> {
  // Inlined by Next at build time; off in tests/CI.
  if (process.env.NEXT_PUBLIC_PREVIEW_LATENCY === '1') {
    await sleep(150 + Math.random() * 200);
  }
  const method = (init.method ?? 'GET').toUpperCase() as PreviewRequest['method'];
  try {
    const qIdx = path.indexOf('?');
    const pathname = qIdx >= 0 ? path.slice(0, qIdx) : path;
    const query = toSearchParams(init.query);
    if (qIdx >= 0) {
      for (const [k, v] of new URLSearchParams(path.slice(qIdx + 1))) query.append(k, v);
    }
    const ctx = await getContext();
    const result = await dispatch(
      {
        method,
        path: pathname.startsWith('/') ? pathname : `/${pathname}`,
        query,
        body: init.body,
        locale: init.locale ?? 'en',
      },
      ctx,
    );
    return (result === undefined ? undefined : structuredClone(result)) as T;
  } catch (e) {
    if (ApiError.isApiError(e)) throw e;
    console.error('[preview] request failed', method, path, e);
    throw internalError(e instanceof Error ? e.message : String(e));
  }
}

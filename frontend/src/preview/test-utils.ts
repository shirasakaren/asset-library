import type { CollectionName, Db, Doc, SeedSource } from './types';
import { createDb } from './store/db';
import { dispatch, type PreviewRequest } from './router/router';
import { createContext } from './router/context';
import { toSearchParams } from './router/query';
import './handlers';

export async function createTestApp(
  seed: Partial<Record<CollectionName, Doc[]>> = {},
  opts: { meId?: string; timers?: boolean } = {},
): Promise<{
  call<T = unknown>(
    method: string,
    path: string,
    opts?: { query?: Record<string, unknown>; body?: unknown; locale?: 'en' | 'id' },
  ): Promise<T>;
  db: Db;
}> {
  const source: SeedSource = { load: async (coll) => seed[coll] ?? [] };
  // overlay: null => in-memory only, so `db.persistent === false` in tests.
  const db = await createDb({ seed: source, overlay: null, seedVersion: 'test' });
  const ctx = createContext(db, { meId: opts.meId, timers: opts.timers ?? true });
  return {
    db,
    async call<T>(
      method: string,
      path: string,
      o: { query?: Record<string, unknown>; body?: unknown; locale?: 'en' | 'id' } = {},
    ) {
      const result = await dispatch(
        {
          method: method.toUpperCase() as PreviewRequest['method'],
          path,
          query: toSearchParams(o.query),
          body: o.body,
          locale: o.locale ?? 'en',
        },
        ctx,
      );
      return (result === undefined ? undefined : structuredClone(result)) as T;
    },
  };
}

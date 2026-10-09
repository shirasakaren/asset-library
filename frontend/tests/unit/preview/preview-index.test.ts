import 'fake-indexeddb/auto';
import { describe, it, expect, vi } from 'vitest';
import { getDb, resetDemo, previewFetch } from '@/preview';
import { route } from '@/preview/router/router';
import { createIdbOverlay } from '@/preview/store/overlay';
import { ApiError } from '@/lib/api/errors';
import { getBlobStore } from '@/preview/uploads/blob-store';
import { objectUrlFor } from '@/preview/uploads/blob-url';

describe('preview index singleton', () => {
  it('concurrent first calls to getDb share one instance', async () => {
    const [a, b, c] = await Promise.all([getDb(), getDb(), getDb()]);
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(await getDb()).toBe(a);
  });

  it('resetDemo clears overlay state (memory and IndexedDB)', async () => {
    const db = await getDb();
    expect(db.persistent).toBe(true);
    await db.put('kv', { id: 'reset-me', v: 1 } as never);
    expect(await db.get('kv', 'reset-me')).toBeDefined();
    const before = await createIdbOverlay()
      .open()
      .then(async () => {
        const o = createIdbOverlay();
        await o.open();
        return o.all();
      });
    expect(before.has('kv/reset-me')).toBe(true);

    await resetDemo();

    expect(await db.get('kv', 'reset-me')).toBeUndefined();
    const o = createIdbOverlay();
    await o.open();
    expect((await o.all()).size).toBe(0);
  });
});

describe('resetDemo and the blob store', () => {
  it('also clears uploaded blobs and revokes their object URLs', async () => {
    const store = getBlobStore();
    await store.put('up-reset', new Blob(['bytes']));
    await store.putMetadata('up-big', { size: 99 });
    const revoked: string[] = [];
    URL.createObjectURL = () => 'blob:test/reset';
    URL.revokeObjectURL = (u: string) => void revoked.push(u);
    try {
      objectUrlFor('file:reset', new Blob(['x']));
      expect((await store.list()).length).toBe(2);

      await resetDemo();

      expect(await store.list()).toEqual([]);
      expect(revoked).toEqual(['blob:test/reset']);
    } finally {
      // @ts-expect-error restore jsdom default
      delete URL.createObjectURL;
      // @ts-expect-error restore jsdom default
      delete URL.revokeObjectURL;
    }
  });
});

describe('previewFetch', () => {
  it('merges a query embedded in the path with the query option', async () => {
    route('GET', '/t-idx-embedded', (req) => ({
      x: req.query.getAll('x'),
      y: req.query.get('y'),
      path: req.path,
    }));
    const out = await previewFetch<{ x: string[]; y: string; path: string }>(
      '/t-idx-embedded?x=1&x=2',
      { query: { y: 'z' } },
    );
    expect(out).toEqual({ x: ['1', '2'], y: 'z', path: '/t-idx-embedded' });
  });

  it('passes undefined (204-style) results through', async () => {
    route('DELETE', '/t-idx-204', () => undefined);
    expect(await previewFetch('/t-idx-204', { method: 'DELETE' })).toBeUndefined();
  });

  it('logs the original error with method and path before mapping to 500', async () => {
    // A function result passes dispatch but makes structuredClone throw (outer catch).
    route('GET', '/t-idx-unclonable', () => () => 1);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const err = await previewFetch('/t-idx-unclonable').catch((e) => e);
    expect(ApiError.isApiError(err) && err.status).toBe(500);
    const args = spy.mock.calls.flat();
    expect(args).toContain('GET');
    expect(args).toContain('/t-idx-unclonable');
    expect(args.some((a) => a instanceof Error)).toBe(true);
    spy.mockRestore();
  });
});

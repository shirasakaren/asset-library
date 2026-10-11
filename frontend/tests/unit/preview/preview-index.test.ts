import 'fake-indexeddb/auto';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { getDb, resetDemo, previewFetch } from '@/preview';
import { route } from '@/preview/router/router';
import { createIdbOverlay } from '@/preview/store/overlay';
import { ApiError } from '@/lib/api/errors';
import { getBlobStore } from '@/preview/uploads/blob-store';
import { objectUrlFor } from '@/preview/uploads/blob-url';
import { ResetPartialError } from '@/preview/reset-error';
import { cancelPendingSimulations, scheduleSimulation } from '@/preview/simulations';

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

describe('resetDemo failure handling', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    cancelPendingSimulations();
  });

  it('rejects when the overlay cannot be cleared, and leaves the blobs alone', async () => {
    const db = await getDb();
    await db.put('kv', { id: 'survivor', v: 1 } as never);
    const store = getBlobStore();
    await store.put('up-kept', new Blob(['b']));
    const original = IDBObjectStore.prototype.clear;
    vi.spyOn(IDBObjectStore.prototype, 'clear').mockImplementation(function (this: IDBObjectStore) {
      if (this.name === 'overlay') throw new Error('clear blocked');
      return original.call(this);
    });
    await expect(resetDemo()).rejects.toThrow('clear blocked');
    expect(await db.get('kv', 'survivor')).toBeDefined();
    expect((await store.list()).map((m) => m.id)).toContain('up-kept');
    vi.restoreAllMocks();
    await resetDemo(); // a retry works
    expect(await db.get('kv', 'survivor')).toBeUndefined();
  });

  it('retries a failing blob clear once', async () => {
    const store = getBlobStore();
    const real = store.clear.bind(store);
    const clear = vi
      .spyOn(store, 'clear')
      .mockRejectedValueOnce(new Error('blob db busy'))
      .mockImplementation(real);
    await expect(resetDemo()).resolves.toBeUndefined();
    expect(clear).toHaveBeenCalledTimes(2);
  });

  it('reports a ResetPartialError when the records are reset but the blobs cannot be cleared', async () => {
    const db = await getDb();
    await db.put('kv', { id: 'gone-after', v: 1 } as never);
    vi.spyOn(getBlobStore(), 'clear').mockRejectedValue(new Error('blob db broken'));
    const err = await resetDemo().then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ResetPartialError);
    expect(await db.get('kv', 'gone-after')).toBeUndefined();
  });

  it('cancels pending simulations first', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const fired = vi.fn();
      scheduleSimulation(fired, 100);
      await resetDemo();
      await vi.advanceTimersByTimeAsync(500);
      expect(fired).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

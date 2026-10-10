import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BLOB_STORE_MAX_BYTES, createBlobStore, getBlobStore } from '@/preview/uploads/blob-store';
import {
  blobToDataUrl,
  clearObjectUrls,
  objectUrlFor,
  parseBlobRef,
  blobRef,
  revokeObjectUrl,
} from '@/preview/uploads/blob-url';

const bytes = (n: number, fill = 7) =>
  new Blob([new Uint8Array(n).fill(fill)], { type: 'image/png' });
const readText = (b: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsText(b);
  });

describe('blob store (IndexedDB)', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
  });

  it('stores, reads, lists and deletes blobs, and reports persistence', async () => {
    const store = createBlobStore();
    const meta = await store.put('b1', new Blob(['hello'], { type: 'text/plain' }));
    expect(meta).toMatchObject({ id: 'b1', size: 5, type: 'text/plain', stored: true });
    expect(store.persistent).toBe(true);

    const got = await store.get('b1');
    expect(got?.stored).toBe(true);
    expect(got?.size).toBe(5);
    expect(got?.type).toBe('text/plain');
    expect(await readText(got!.blob!)).toBe('hello');

    await store.put('b2', new Blob(['x']));
    expect((await store.list()).map((m) => m.id).sort()).toEqual(['b1', 'b2']);

    await store.delete('b1');
    expect(await store.get('b1')).toBeUndefined();
    expect((await store.list()).map((m) => m.id)).toEqual(['b2']);

    await store.clear();
    expect(await store.list()).toEqual([]);
  });

  it('survives a second store instance over the same database', async () => {
    await createBlobStore().put('keep', new Blob(['kept']));
    const again = await createBlobStore().get('keep');
    expect(again?.size).toBe(4);
  });

  it('keeps only metadata for blobs over 5 MB', async () => {
    const store = createBlobStore();
    const big = bytes(BLOB_STORE_MAX_BYTES + 1);
    const meta = await store.put('big', big);
    expect(meta).toMatchObject({ id: 'big', size: BLOB_STORE_MAX_BYTES + 1, stored: false });
    const got = await store.get('big');
    expect(got).toMatchObject({ size: BLOB_STORE_MAX_BYTES + 1, stored: false, blob: null });
    // exactly at the limit is still stored
    expect((await store.put('edge', bytes(BLOB_STORE_MAX_BYTES))).stored).toBe(true);
  });

  it('putMetadata records a size without a blob', async () => {
    const store = createBlobStore();
    await store.putMetadata('m', { size: 123456789, type: 'application/zip' });
    expect(await store.get('m')).toMatchObject({
      size: 123456789,
      type: 'application/zip',
      stored: false,
      blob: null,
    });
  });

  it('deleteByPrefix removes only matching ids', async () => {
    const store = createBlobStore();
    await store.put('up1/part/1', new Blob(['a']));
    await store.put('up1/part/2', new Blob(['b']));
    await store.put('up2', new Blob(['c']));
    await store.deleteByPrefix('up1/');
    expect((await store.list()).map((m) => m.id)).toEqual(['up2']);
  });

  it('getBlobStore is a shared singleton', () => {
    expect(getBlobStore()).toBe(getBlobStore());
  });
});

describe('blob store (no IndexedDB)', () => {
  it('falls back to memory when IndexedDB is unavailable', async () => {
    const store = createBlobStore({ factory: null });
    await store.put('m1', new Blob(['mem']));
    expect(store.persistent).toBe(false);
    const got = await store.get('m1');
    expect(await readText(got!.blob!)).toBe('mem');
    await store.clear();
    expect(await store.list()).toEqual([]);
  });

  it('falls back to memory when the database cannot be opened', async () => {
    const broken = {
      open() {
        throw new Error('SecurityError');
      },
    } as unknown as IDBFactory;
    const store = createBlobStore({ factory: broken });
    await store.put('m1', new Blob(['mem']));
    expect(store.persistent).toBe(false);
    expect((await store.get('m1'))?.size).toBe(3);
  });

  it('falls back to memory when the open is blocked', async () => {
    const blocked = {
      open() {
        const req: Record<string, unknown> = {};
        queueMicrotask(() => (req.onblocked as (() => void) | undefined)?.());
        return req;
      },
    } as unknown as IDBFactory;
    const store = createBlobStore({ factory: blocked });
    await store.put('m1', new Blob(['mem']));
    expect(store.persistent).toBe(false);
  });

  it('falls back to memory when the open never settles (timeout)', async () => {
    const hanging = { open: () => ({}) } as unknown as IDBFactory;
    const store = createBlobStore({ factory: hanging, openTimeoutMs: 20 });
    await store.put('m1', new Blob(['mem']));
    expect(store.persistent).toBe(false);
  });
});

describe('blob store: buffers, closed connections, schema', () => {
  const DB = 'mgm-preview-blobs';
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
  });
  afterEach(() => vi.restoreAllMocks());

  /** A factory that remembers every connection it opened. */
  function trackingFactory() {
    const real = globalThis.indexedDB;
    const dbs: IDBDatabase[] = [];
    const factory = {
      open(name: string, version?: number) {
        const req = real.open(name, version);
        req.addEventListener('success', () => dbs.push(req.result));
        return req;
      },
    } as unknown as IDBFactory;
    return { factory, dbs, real };
  }

  it('list and deleteByPrefix never read the buffers of the blobs store', async () => {
    const store = createBlobStore();
    await store.put('keep', bytes(64));
    await store.put('up_1/part/1', bytes(64));
    await store.put('up_1/part/2', bytes(64));
    const reads: string[] = [];
    for (const method of ['getAll', 'get', 'openCursor'] as const) {
      const original = IDBObjectStore.prototype[method] as (...a: unknown[]) => unknown;
      vi.spyOn(IDBObjectStore.prototype, method).mockImplementation(function (
        this: IDBObjectStore,
        ...a: unknown[]
      ) {
        if (this.name === 'blobs') reads.push(method);
        return original.apply(this, a);
      } as never);
    }
    expect((await store.list()).map((m) => m.id).sort()).toEqual([
      'keep',
      'up_1/part/1',
      'up_1/part/2',
    ]);
    await store.deleteByPrefix('up_1/');
    expect((await store.list()).map((m) => m.id)).toEqual(['keep']);
    expect(reads).toEqual([]);
    expect(await store.get('up_1/part/1')).toBeUndefined();
    expect((await store.get('keep'))?.size).toBe(64);
  });

  it('migrates a v1 database (blobs only) to the metadata store', async () => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore('blobs', { keyPath: 'id' }).put({
          id: 'old',
          size: 3,
          type: 'text/plain',
          stored: true,
          createdAt: '2026-01-01T00:00:00.000Z',
          buffer: new Uint8Array([97, 98, 99]).buffer,
        });
      };
      req.onsuccess = () => {
        req.result.close();
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
    const store = createBlobStore();
    expect(await store.list()).toEqual([
      {
        id: 'old',
        size: 3,
        type: 'text/plain',
        stored: true,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ]);
    expect(await readText((await store.get('old'))!.blob!)).toBe('abc');
    expect(store.persistent).toBe(true);
  });

  it('closes on versionchange (another tab upgrading) and keeps working afterwards', async () => {
    const { factory, real } = trackingFactory();
    const store = createBlobStore({ factory });
    await store.put('a', bytes(8));
    // Another connection asks for a newer version: without a versionchange handler the request
    // stays blocked forever.
    await new Promise<void>((resolve, reject) => {
      const req = real.open(DB, 3);
      req.onblocked = () => reject(new Error('the store did not close on versionchange'));
      req.onupgradeneeded = () => undefined;
      req.onsuccess = () => {
        req.result.close();
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
    // Later operations must not throw (the reopen is refused, so the store runs in memory).
    await expect(store.put('b', bytes(4))).resolves.toMatchObject({ id: 'b' });
    expect((await store.get('b'))?.size).toBe(4);
    await expect(store.list()).resolves.toHaveLength(1);
    await expect(store.deleteByPrefix('b')).resolves.toBeUndefined();
    await expect(store.clear()).resolves.toBeUndefined();
  });

  it('reopens after the browser closed the connection (onclose)', async () => {
    const { factory, dbs } = trackingFactory();
    const store = createBlobStore({ factory });
    await store.put('a', bytes(8));
    expect(dbs).toHaveLength(1);
    dbs[0]!.close();
    (dbs[0]!.onclose as (() => void) | null)?.();
    await expect(store.put('b', bytes(4))).resolves.toMatchObject({ id: 'b' });
    expect(dbs).toHaveLength(2);
    expect(store.persistent).toBe(true);
    expect((await store.list()).map((m) => m.id).sort()).toEqual(['a', 'b']);
  });

  it('retries once on a connection that was closed without any event', async () => {
    const { factory, dbs } = trackingFactory();
    const store = createBlobStore({ factory });
    await store.put('a', bytes(8));
    dbs[0]!.close(); // db.transaction() now throws InvalidStateError
    expect((await store.get('a'))?.size).toBe(8);
    expect(dbs).toHaveLength(2);
    expect(store.persistent).toBe(true);
  });
});

describe('blob-url helpers', () => {
  it('round-trips stable references', () => {
    expect(blobRef('abc')).toBe('preview-blob:abc');
    expect(parseBlobRef('preview-blob:abc')).toBe('abc');
    expect(parseBlobRef('blob:http://x/1')).toBeNull();
    expect(parseBlobRef('https://x')).toBeNull();
  });

  it('turns a blob into a data URL', async () => {
    const url = await blobToDataUrl(new Blob(['hi'], { type: 'text/plain' }));
    expect(url.startsWith('data:text/plain')).toBe(true);
    expect(url.endsWith(btoa('hi'))).toBe(true);
  });

  it('caches object URLs per key and revokes them', () => {
    let n = 0;
    const created: string[] = [];
    const revoked: string[] = [];
    URL.createObjectURL = () => {
      n += 1;
      created.push(`blob:test/${n}`);
      return `blob:test/${n}`;
    };
    URL.revokeObjectURL = (u: string) => void revoked.push(u);
    try {
      const a = objectUrlFor('k1', new Blob(['1']));
      expect(objectUrlFor('k1', new Blob(['other']))).toBe(a);
      const b = objectUrlFor('k2', new Blob(['2']));
      expect(b).not.toBe(a);
      revokeObjectUrl('k1');
      expect(revoked).toEqual([a]);
      expect(objectUrlFor('k1', new Blob(['1']))).not.toBe(a);
      clearObjectUrls();
      expect(revoked).toContain(b);
    } finally {
      // @ts-expect-error restore the jsdom default (not implemented)
      delete URL.createObjectURL;
      // @ts-expect-error restore the jsdom default (not implemented)
      delete URL.revokeObjectURL;
    }
  });

  it('returns null when object URLs are unsupported', () => {
    expect(objectUrlFor('nope', new Blob(['x']))).toBeNull();
  });
});

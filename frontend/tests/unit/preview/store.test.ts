import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createDb } from '@/preview/store/db';
import { createIdbOverlay } from '@/preview/store/overlay';
import { createSeedSource } from '@/preview/store/seed-source';
import type { SeedSource, Doc } from '@/preview/types';

const seed: SeedSource = {
  async load(coll) {
    if (coll === 'assets')
      return [{ id: 'a1', title: 'One' } as Doc, { id: 'a2', title: 'Two' } as Doc];
    return [];
  },
};

describe('db', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
  });

  it('merges seed with overlay puts and tombstones', async () => {
    const db = await createDb({ seed, overlay: createIdbOverlay(), seedVersion: '1' });
    await db.patch('assets', 'a1', { title: 'Changed' } as never);
    await db.remove('assets', 'a2');
    await db.put('assets', { id: 'a3', title: 'New' } as never);
    const ids = (await db.list('assets')).map((d) => d.id).sort();
    expect(ids).toEqual(['a1', 'a3']);
    expect((await db.get<any>('assets', 'a1'))!.title).toBe('Changed');
  });

  it('persists across a new Db instance', async () => {
    const overlay = createIdbOverlay();
    const db1 = await createDb({ seed, overlay, seedVersion: '1' });
    await db1.put('assets', { id: 'a9', title: 'Kept' } as never);
    const db2 = await createDb({ seed, overlay: createIdbOverlay(), seedVersion: '1' });
    expect(await db2.get('assets', 'a9')).toBeTruthy();
  });

  it('resets overlay when seedVersion changes', async () => {
    const db1 = await createDb({ seed, overlay: createIdbOverlay(), seedVersion: '1' });
    await db1.put('assets', { id: 'a9' } as never);
    const db2 = await createDb({ seed, overlay: createIdbOverlay(), seedVersion: '2' });
    expect(await db2.get('assets', 'a9')).toBeUndefined();
  });

  it('falls back to memory when overlay is null and flags persistent=false', async () => {
    const db = await createDb({ seed, overlay: null, seedVersion: '1' });
    await db.put('assets', { id: 'x' } as never);
    expect(db.persistent).toBe(false);
    expect(await db.get('assets', 'x')).toBeTruthy();
  });

  it('survives a throwing overlay (Review Focus 1)', async () => {
    const bad = {
      open: async () => {
        throw new Error('blocked');
      },
    } as never;
    const db = await createDb({ seed, overlay: bad, seedVersion: '1' });
    expect(db.persistent).toBe(false);
    expect((await db.list('assets')).length).toBe(2);
  });

  it('reset() clears overlay back to seed', async () => {
    const db = await createDb({ seed, overlay: createIdbOverlay(), seedVersion: '1' });
    await db.remove('assets', 'a1');
    await db.reset();
    expect((await db.list('assets')).length).toBe(2);
  });

  it('patch on a missing id throws not found', async () => {
    const db = await createDb({ seed, overlay: null, seedVersion: '1' });
    await expect(db.patch('assets', 'nope', {} as never)).rejects.toThrow('not found');
  });

  it('a failing overlay write flips persistent=false without throwing', async () => {
    const overlay = createIdbOverlay();
    const db = await createDb({ seed, overlay, seedVersion: '1' });
    expect(db.persistent).toBe(true);
    overlay.set = async () => {
      throw new Error('quota');
    };
    await db.put('assets', { id: 'q' } as never);
    expect(db.persistent).toBe(false);
    expect(await db.get('assets', 'q')).toBeTruthy();
  });

  it('open() rejects when indexedDB is undefined', async () => {
    const saved = globalThis.indexedDB;
    // @ts-expect-error simulate missing IndexedDB
    globalThis.indexedDB = undefined;
    try {
      await expect(createIdbOverlay().open()).rejects.toThrow();
      const db = await createDb({ seed, overlay: createIdbOverlay(), seedVersion: '1' });
      expect(db.persistent).toBe(false);
    } finally {
      globalThis.indexedDB = saved;
    }
  });
});

describe('db fix round 1', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
  });

  const nestedSeed: SeedSource = {
    async load(coll) {
      if (coll === 'assets') {
        return [
          { id: 'a1', title: 'One', tags: ['x'] } as Doc,
          { id: 'a2', title: 'Two', tags: [] } as Doc,
        ];
      }
      return [];
    },
  };

  it('returned docs are copies: mutation does not leak into later reads or the seed', async () => {
    const db = await createDb({ seed: nestedSeed, overlay: null, seedVersion: '1' });
    const got = (await db.get<any>('assets', 'a1'))!;
    got.title = 'Mutated';
    got.tags.push('leak');
    const listed = (await db.list<any>('assets'))[1];
    listed.title = 'Mutated2';
    expect((await db.get<any>('assets', 'a1'))!.title).toBe('One');
    expect((await db.get<any>('assets', 'a1'))!.tags).toEqual(['x']);
    expect((await db.get<any>('assets', 'a2'))!.title).toBe('Two');
    await db.patch('assets', 'a1', { title: 'P' } as never);
    await db.reset();
    expect(await db.get<any>('assets', 'a1')).toEqual({ id: 'a1', title: 'One', tags: ['x'] });
  });

  it('seed docs stay pristine even if the SeedSource hands out shared objects', async () => {
    const shared = [{ id: 's1', tags: ['x'] } as Doc];
    const sharedSeed: SeedSource = { load: async (c) => (c === 'assets' ? shared : []) };
    const db = await createDb({ seed: sharedSeed, overlay: null, seedVersion: '1' });
    (await db.get<any>('assets', 's1'))!.tags.push('leak');
    expect((shared[0] as any).tags).toEqual(['x']);
  });

  it('put/patch store copies of their inputs and return copies', async () => {
    const db = await createDb({ seed: nestedSeed, overlay: null, seedVersion: '1' });
    const input = { id: 'n1', list: [1] };
    const stored = await db.put('assets', input as never);
    input.list.push(2);
    (stored as any).list.push(3);
    expect((await db.get<any>('assets', 'n1'))!.list).toEqual([1]);
    const partial = { tags: ['p'] };
    const patched = await db.patch<any>('assets', 'a1', partial as never);
    partial.tags.push('q');
    patched.tags.push('r');
    expect((await db.get<any>('assets', 'a1'))!.tags).toEqual(['p']);
  });

  it('keeps overlay-only docs in creation order after reload', async () => {
    const db1 = await createDb({ seed, overlay: createIdbOverlay(), seedVersion: '1' });
    await db1.put('assets', { id: 'a3' } as never);
    await db1.put('assets', { id: 'a1x' } as never);
    await db1.put('assets', { id: 'a2x' } as never);
    const db2 = await createDb({ seed, overlay: createIdbOverlay(), seedVersion: '1' });
    expect((await db2.list('assets')).map((d) => d.id)).toEqual(['a1', 'a2', 'a3', 'a1x', 'a2x']);
    await db2.put('assets', { id: 'a0' } as never);
    expect((await db2.list('assets')).map((d) => d.id).slice(-1)).toEqual(['a0']);
  });

  it('concurrent patches on one doc both apply', async () => {
    const db = await createDb({ seed, overlay: createIdbOverlay(), seedVersion: '1' });
    await Promise.all([
      db.patch('assets', 'a1', { a: 1 } as never),
      db.patch('assets', 'a1', { b: 2 } as never),
    ]);
    const expected = { id: 'a1', title: 'One', a: 1, b: 2 };
    expect(await db.get('assets', 'a1')).toEqual(expected);
    const db2 = await createDb({ seed, overlay: createIdbOverlay(), seedVersion: '1' });
    expect(await db2.get('assets', 'a1')).toEqual(expected);
  });

  it('concurrent put/remove on different ids all apply', async () => {
    const db = await createDb({ seed, overlay: createIdbOverlay(), seedVersion: '1' });
    await Promise.all([
      db.put('assets', { id: 'n1' } as never),
      db.remove('assets', 'a1'),
      db.put('assets', { id: 'n2' } as never),
      db.remove('assets', 'a2'),
    ]);
    expect((await db.list('assets')).map((d) => d.id)).toEqual(['n1', 'n2']);
  });

  it('does not cache a failed seed load permanently', async () => {
    let calls = 0;
    const flaky: SeedSource = {
      async load() {
        if (calls++ === 0) throw new Error('boom');
        return [{ id: 'f1' }];
      },
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const db = await createDb({ seed: flaky, overlay: null, seedVersion: '1' });
    expect(await db.list('assets')).toEqual([]);
    expect(warn).toHaveBeenCalled();
    expect((await db.list('assets')).map((d) => d.id)).toEqual(['f1']);
    warn.mockRestore();
  });

  it('drops malformed overlay rows on load', async () => {
    const overlay = createIdbOverlay();
    await overlay.open();
    await overlay.setMeta('seedVersion', '1');
    await overlay.set('assets/ok', { op: 'put', doc: { id: 'ok' }, seq: 1 });
    await overlay.set('assets/mismatch', { op: 'put', doc: { id: 'other' }, seq: 2 });
    await overlay.set('assets/noop', {} as never);
    await overlay.set('assets/nodoc', { op: 'put' });
    const db = await createDb({ seed, overlay: createIdbOverlay(), seedVersion: '1' });
    expect((await db.list('assets')).map((d) => d.id)).toEqual(['a1', 'a2', 'ok']);
    expect(await db.get('assets', 'other')).toBeUndefined();
  });

  it('overlay put of a seed id replaces in place without duplicating', async () => {
    const db = await createDb({ seed, overlay: createIdbOverlay(), seedVersion: '1' });
    await db.put('assets', { id: 'a1', title: 'Replaced' } as never);
    const rows = await db.list<any>('assets');
    expect(rows.map((d) => d.id)).toEqual(['a1', 'a2']);
    expect(rows[0].title).toBe('Replaced');
  });

  it('tombstone then re-put reappears at the seed position', async () => {
    const db = await createDb({ seed, overlay: createIdbOverlay(), seedVersion: '1' });
    await db.remove('assets', 'a1');
    await db.put('assets', { id: 'n1' } as never);
    await db.put('assets', { id: 'a1', title: 'Back' } as never);
    expect((await db.list('assets')).map((d) => d.id)).toEqual(['a1', 'a2', 'n1']);
  });

  it('patch on a tombstoned doc throws not found; patch merges against the overlay doc', async () => {
    const db = await createDb({ seed, overlay: null, seedVersion: '1' });
    await db.remove('assets', 'a1');
    await expect(db.patch('assets', 'a1', { title: 'x' } as never)).rejects.toThrow('not found');
    await db.put('assets', { id: 'o1', title: 'T', extra: 1 } as never);
    await db.patch('assets', 'o1', { title: 'T2' } as never);
    expect(await db.get('assets', 'o1')).toEqual({ id: 'o1', title: 'T2', extra: 1 });
  });

  it('stores the new seedVersion meta after a bump', async () => {
    await createDb({ seed, overlay: createIdbOverlay(), seedVersion: '1' });
    await createDb({ seed, overlay: createIdbOverlay(), seedVersion: '2' });
    const check = createIdbOverlay();
    await check.open();
    expect(await check.getMeta('seedVersion')).toBe('2');
  });
});

describe('overlay open()', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('rejects after the boot timeout when indexedDB.open never fires, and closes a late connection', async () => {
    vi.useFakeTimers();
    const saved = globalThis.indexedDB;
    const req: Record<string, any> = {};
    globalThis.indexedDB = { open: () => req } as never;
    try {
      const p = createIdbOverlay().open();
      const assertion = expect(p).rejects.toThrow(/timed out/);
      await vi.advanceTimersByTimeAsync(4000);
      await assertion;
      const close = vi.fn();
      req.result = { close };
      req.onsuccess();
      expect(close).toHaveBeenCalled();
    } finally {
      globalThis.indexedDB = saved;
    }
  });

  it('closes a connection that opens after onblocked rejected', async () => {
    const saved = globalThis.indexedDB;
    const req: Record<string, any> = {};
    globalThis.indexedDB = { open: () => req } as never;
    try {
      const p = createIdbOverlay().open();
      req.onblocked();
      await expect(p).rejects.toThrow(/blocked/);
      const close = vi.fn();
      req.result = { close };
      req.onsuccess();
      expect(close).toHaveBeenCalled();
    } finally {
      globalThis.indexedDB = saved;
    }
  });
});

describe('seed source', () => {
  it('load() resolves to an array even when the seed module is missing', async () => {
    const rows = await createSeedSource().load('assets');
    expect(Array.isArray(rows)).toBe(true);
  });
});

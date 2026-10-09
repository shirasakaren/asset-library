import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, it, expect, beforeEach } from 'vitest';
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

describe('seed source', () => {
  it('load() resolves to an array even when the seed module is missing', async () => {
    const rows = await createSeedSource().load('assets');
    expect(Array.isArray(rows)).toBe(true);
  });
});

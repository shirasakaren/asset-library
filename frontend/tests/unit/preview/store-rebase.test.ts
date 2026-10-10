import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, it, expect, beforeEach } from 'vitest';
import { createDb } from '@/preview/store/db';
import { createIdbOverlay } from '@/preview/store/overlay';
import { SEED_ANCHOR } from '@/preview/store/version';
import type { Doc, SeedSource } from '@/preview/types';

interface Row extends Doc {
  at: string;
  day: string;
  name: string;
}

const seed: SeedSource = {
  async load(coll) {
    if (coll === 'assets') {
      return [
        { id: 'a1', at: '2026-09-30T10:00:00.000Z', day: '2026-09-30', name: 'a-2026-10-01-x' },
      ] as Row[];
    }
    return [];
  },
};

const clock = (iso: string) => ({ anchor: SEED_ANCHOR, now: () => new Date(iso) });
const open = (rebase?: { anchor: string; now: () => Date }, overlay = createIdbOverlay()) =>
  createDb({ seed, overlay, seedVersion: '1', rebase });

describe('createDb with rebase', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
  });

  it('shifts every seed date by the whole days since the anchor, nothing else', async () => {
    const db = await open(clock('2026-10-10T08:00:00.000Z'));
    expect(await db.get<Row>('assets', 'a1')).toEqual({
      id: 'a1',
      at: '2026-10-09T10:00:00.000Z',
      day: '2026-10-09',
      name: 'a-2026-10-01-x',
    });
    expect((await db.list<Row>('assets'))[0]!.at).toBe('2026-10-09T10:00:00.000Z');
  });

  it('does nothing without rebase, before the anchor, or on the anchor day', async () => {
    expect((await open()).get<Row>('assets', 'a1')).resolves.toMatchObject({
      at: '2026-09-30T10:00:00.000Z',
    });
    globalThis.indexedDB = new IDBFactory();
    const early = await open(clock('2026-08-01T00:00:00.000Z'));
    expect((await early.get<Row>('assets', 'a1'))!.day).toBe('2026-09-30');
    globalThis.indexedDB = new IDBFactory();
    const same = await open(clock('2026-10-01T12:00:00.000Z'));
    expect((await same.get<Row>('assets', 'a1'))!.day).toBe('2026-09-30');
  });

  it('keeps the offset of a visitor for good: a new Db on the same overlay ignores the new date', async () => {
    const first = await open(clock('2026-10-10T08:00:00.000Z'));
    await first.patch<Row>('assets', 'a1', { name: 'edited' });
    const later = await open(clock('2027-03-01T08:00:00.000Z'));
    const row = (await later.get<Row>('assets', 'a1'))!;
    expect(row.day).toBe('2026-10-09');
    expect(row.name).toBe('edited');
    const check = createIdbOverlay();
    await check.open();
    expect(await check.getMeta('rebaseOffsetDays')).toBe('9');
  });

  it('patched seed docs keep their rebased dates in the overlay', async () => {
    const first = await open(clock('2026-10-10T08:00:00.000Z'));
    await first.patch<Row>('assets', 'a1', { name: 'edited' });
    const again = await open(clock('2026-10-10T09:00:00.000Z'));
    expect((await again.get<Row>('assets', 'a1'))!.at).toBe('2026-10-09T10:00:00.000Z');
  });

  it('reset() gives a fresh offset from the current clock', async () => {
    let now = new Date('2026-10-10T08:00:00.000Z');
    const db = await createDb({
      seed,
      overlay: createIdbOverlay(),
      seedVersion: '1',
      rebase: { anchor: SEED_ANCHOR, now: () => now },
    });
    expect((await db.get<Row>('assets', 'a1'))!.day).toBe('2026-10-09');
    now = new Date('2026-10-20T08:00:00.000Z');
    await db.reset();
    expect((await db.get<Row>('assets', 'a1'))!.day).toBe('2026-10-19');
    const check = createIdbOverlay();
    await check.open();
    expect(await check.getMeta('rebaseOffsetDays')).toBe('19');
  });

  it('a seedVersion bump recomputes the offset', async () => {
    await open(clock('2026-10-10T08:00:00.000Z'));
    const bumped = await createDb({
      seed,
      overlay: createIdbOverlay(),
      seedVersion: '2',
      rebase: clock('2026-11-10T08:00:00.000Z'),
    });
    expect((await bumped.get<Row>('assets', 'a1'))!.day).toBe('2026-11-09');
  });

  it('keeps the offset in memory when there is no overlay, and recomputes on reset', async () => {
    let now = new Date('2026-10-10T08:00:00.000Z');
    const db = await createDb({
      seed,
      overlay: null,
      seedVersion: '1',
      rebase: { anchor: SEED_ANCHOR, now: () => now },
    });
    expect((await db.get<Row>('assets', 'a1'))!.day).toBe('2026-10-09');
    now = new Date('2026-12-10T08:00:00.000Z');
    expect((await db.get<Row>('assets', 'a1'))!.day).toBe('2026-10-09');
    await db.reset();
    expect((await db.get<Row>('assets', 'a1'))!.day).toBe('2026-12-09');
  });

  it('ignores a corrupt stored offset', async () => {
    const o = createIdbOverlay();
    await o.open();
    await o.setMeta('seedVersion', '1');
    await o.setMeta('rebaseOffsetDays', 'banana');
    const db = await open(clock('2026-10-10T08:00:00.000Z'));
    expect((await db.get<Row>('assets', 'a1'))!.day).toBe('2026-10-09');
  });
});

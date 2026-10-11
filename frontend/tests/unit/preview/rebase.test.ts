import { describe, it, expect } from 'vitest';
import { SEED_ANCHOR } from '@/preview/store/version';
import { rebaseOffsetDays, shiftSeedValue } from '@/preview/store/rebase';
import kv from '@/preview/seed-data/kv.json';

describe('SEED_ANCHOR', () => {
  it('equals the anchor of the committed seed (kv.json meta)', () => {
    const meta = (kv as Array<{ id: string; value: { anchor: string } }>).find(
      (r) => r.id === 'meta',
    )!;
    expect(new Date(SEED_ANCHOR).toISOString()).toBe(meta.value.anchor);
  });
});

describe('rebaseOffsetDays', () => {
  const at = (iso: string) => new Date(iso);
  it('is the whole days between the anchor and now, never negative', () => {
    expect(rebaseOffsetDays(SEED_ANCHOR, at('2026-10-01T00:00:00Z'))).toBe(0);
    expect(rebaseOffsetDays(SEED_ANCHOR, at('2026-10-01T23:59:59Z'))).toBe(0);
    expect(rebaseOffsetDays(SEED_ANCHOR, at('2026-10-02T00:00:00Z'))).toBe(1);
    expect(rebaseOffsetDays(SEED_ANCHOR, at('2027-06-01T12:00:00Z'))).toBe(243);
    expect(rebaseOffsetDays(SEED_ANCHOR, at('2026-01-01T00:00:00Z'))).toBe(0);
  });
});

describe('shiftSeedValue', () => {
  it('shifts full ISO datetimes, keeping the format', () => {
    expect(shiftSeedValue('2026-09-30T17:15:15.000Z', 3)).toBe('2026-10-03T17:15:15.000Z');
    expect(shiftSeedValue('2026-09-30T17:15:15Z', 3)).toBe('2026-10-03T17:15:15Z');
    expect(shiftSeedValue('2026-09-30T17:15:15.123Z', 1)).toBe('2026-10-01T17:15:15.123Z');
  });

  it('shifts date-only strings and keeps them date-only', () => {
    expect(shiftSeedValue('2026-09-30', 2)).toBe('2026-10-02');
  });

  it('walks nested arrays and objects without mutating the input', () => {
    const input = {
      a: ['2026-09-01', { b: '2026-09-02T00:00:00.000Z', n: 5, t: true, z: null }],
      c: { d: { e: '2026-09-03' } },
    };
    const copy = structuredClone(input);
    const out = shiftSeedValue(input, 10);
    expect(out).toEqual({
      a: ['2026-09-11', { b: '2026-09-12T00:00:00.000Z', n: 5, t: true, z: null }],
      c: { d: { e: '2026-09-13' } },
    });
    expect(input).toEqual(copy);
  });

  it('leaves every other string alone', () => {
    const untouched = [
      '1.0.0',
      '2.10.3',
      'a-2026-10-01-foo',
      'Updated on 2026-10-01 by Aria',
      '2026-10-01 and more',
      '2026-10-01T00:00:00',
      '2026-10-01T00:00:00+02:00',
      '12:30',
      'v-ultimate-prop-pack-1-1-0',
      '2026-1-1',
      '',
    ];
    for (const s of untouched) expect(shiftSeedValue(s, 7), s).toBe(s);
    expect(shiftSeedValue({ keys: { '2026-10-01': 1 } }, 7)).toEqual({ keys: { '2026-10-01': 1 } });
  });

  it('is exact across month, year and leap-day boundaries (UTC)', () => {
    expect(shiftSeedValue('2026-12-31T23:00:00.000Z', 1)).toBe('2027-01-01T23:00:00.000Z');
    expect(shiftSeedValue('2027-02-28', 1)).toBe('2027-03-01');
    expect(shiftSeedValue('2028-02-28', 1)).toBe('2028-02-29');
    expect(shiftSeedValue('2028-02-29', 1)).toBe('2028-03-01');
    expect(shiftSeedValue('2026-03-28T01:30:00.000Z', 2)).toBe('2026-03-30T01:30:00.000Z');
    expect(shiftSeedValue('2026-10-31T01:30:00.000Z', 1)).toBe('2026-11-01T01:30:00.000Z');
  });

  it('offset 0 changes nothing and large offsets work', () => {
    const v = { d: '2026-09-30T17:15:15.000Z', e: '2026-09-30' };
    expect(shiftSeedValue(v, 0)).toEqual(v);
    expect(shiftSeedValue('2026-09-30', 3650)).toBe('2036-09-27');
    expect(shiftSeedValue('2026-09-30T00:00:00.000Z', 100000)).toBe('2300-07-16T00:00:00.000Z');
  });
});

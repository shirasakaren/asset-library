/**
 * Deterministic pseudo-random numbers for the seed generator.
 *
 * mulberry32 over a fixed constant seed. `fork(label)` derives an independent
 * stream per domain (users, assets, comments, ...), so changing how many numbers
 * one domain draws never shifts the others. Nothing here reads the clock or
 * `Math.random`.
 */

export const SEED = 0xa55e7;

/** 32-bit FNV-1a hash of a string (stable across platforms). */
export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [min, max] (inclusive). */
  int(min: number, max: number): number;
  /** One element of a non-empty array. */
  pick<T>(items: readonly T[]): T;
  /** New array with the items in random order (Fisher-Yates; input untouched). */
  shuffle<T>(items: readonly T[]): T[];
  /** One item chosen proportionally to `weight(item)` (weights must be >= 0, not all 0). */
  weighted<T>(items: readonly T[], weight: (item: T, index: number) => number): T;
  /** True with probability `p`. */
  chance(p: number): boolean;
  /** Uniformly random instant in [fromMs, toMs], returned as an ISO string (ms = 0). */
  date(fromMs: number, toMs: number): string;
  /** Independent child stream named `label`. */
  fork(label: string): Rng;
}

export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number): number => min + Math.floor(next() * (max - min + 1));
  const rng: Rng = {
    next,
    int,
    pick: (items) => {
      if (items.length === 0) throw new Error('pick() from an empty array');
      return items[int(0, items.length - 1)];
    },
    shuffle: (items) => {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i--) {
        const j = int(0, i);
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
    weighted: (items, weight) => {
      let total = 0;
      const ws = items.map((it, i) => {
        const w = Math.max(0, weight(it, i));
        total += w;
        return w;
      });
      if (!(total > 0)) throw new Error('weighted() needs a positive total weight');
      let r = next() * total;
      for (let i = 0; i < items.length; i++) {
        r -= ws[i];
        if (r < 0) return items[i];
      }
      return items[items.length - 1];
    },
    chance: (p) => next() < p,
    date: (fromMs, toMs) => {
      const ms = fromMs + Math.floor(next() * (toMs - fromMs + 1));
      return new Date(Math.floor(ms / 1000) * 1000).toISOString();
    },
    fork: (label) => createRng((seed ^ hash32(label)) >>> 0),
  };
  return rng;
}

/** The root stream every domain forks from. */
export const rootRng = (): Rng => createRng(SEED);

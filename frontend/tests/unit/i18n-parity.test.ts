import { describe, expect, it } from 'vitest';
import en from '../../messages/en.json';
import id from '../../messages/id.json';

/** Dotted paths of every leaf string of a messages object. */
function keys(obj: unknown, prefix = ''): string[] {
  if (obj === null || typeof obj !== 'object') return [prefix];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    keys(v, prefix ? `${prefix}.${k}` : k),
  );
}

describe('messages', () => {
  it('en and id have identical key sets', () => {
    const e = new Set(keys(en));
    const i = new Set(keys(id));
    expect([...e].filter((k) => !i.has(k)).sort(), 'missing in id').toEqual([]);
    expect([...i].filter((k) => !e.has(k)).sort(), 'missing in en').toEqual([]);
  });

  it('the fictional-data notices exist in both languages and are not copies of each other', () => {
    for (const key of [
      'preview.fictionalData',
      'preview.attributionFictional',
      'comments.fictionalNote',
    ]) {
      const get = (m: unknown) =>
        key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], m);
      expect(typeof get(en), `en ${key}`).toBe('string');
      expect(typeof get(id), `id ${key}`).toBe('string');
      expect(get(en)).not.toBe(get(id));
      expect(String(get(en))).toMatch(/fictional/i);
      expect(String(get(id))).toMatch(/fiktif/i);
    }
  });
});

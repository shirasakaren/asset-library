import { describe, expect, it } from 'vitest';
import { createTestApp } from '@/preview/test-utils';

interface Gif {
  id: string;
  url: string;
  preview: string;
  width: number;
  height: number;
  title: string;
}
interface Res {
  provider: string | null;
  results: Gif[];
  available: string[];
  next?: string | null;
}

const search = async (query: Record<string, unknown> = {}) => {
  const app = await createTestApp();
  return app.call<Res>('GET', '/gifs/search', { query });
};

describe('GET /gifs/search', () => {
  it('returns the offline set in the shape the picker reads', async () => {
    const res = await search({ limit: 24 });
    expect(res.provider).toBe('tenor');
    expect(res.available).toEqual(['tenor']);
    expect(res.results).toHaveLength(16);
    for (const g of res.results) {
      expect(g.id).toBeTruthy();
      expect(g.url.startsWith('data:image/svg+xml')).toBe(true);
      expect(g.preview.startsWith('data:image/svg+xml')).toBe(true);
      expect(g.width).toBeGreaterThan(0);
      expect(g.height).toBeGreaterThan(0);
      expect(g.title).toBeTruthy();
    }
    expect(new Set(res.results.map((g) => g.id)).size).toBe(16);
  });

  it('the pictures are animated SVGs carrying their label', async () => {
    const res = await search();
    const wow = res.results.find((g) => g.title.toLowerCase() === 'wow')!;
    const svg = decodeURIComponent(wow.url.slice(wow.url.indexOf(',') + 1));
    expect(svg).toContain('<svg');
    expect(svg).toMatch(/<animate/);
    expect(svg).toContain('wow');
  });

  it('filters by label, case-insensitively', async () => {
    const res = await search({ q: 'PaRt' });
    expect(res.results.map((g) => g.title)).toEqual(['party']);
    expect((await search({ q: 'zzzz' })).results).toEqual([]);
    expect((await search({ q: '  ' })).results).toHaveLength(16);
  });

  it('paginates with limit and pos', async () => {
    const all = (await search({ limit: 50 })).results;
    const first = await search({ limit: 6 });
    expect(first.results.map((g) => g.id)).toEqual(all.slice(0, 6).map((g) => g.id));
    expect(first.next).toBe('6');
    const second = await search({ limit: 6, pos: first.next });
    expect(second.results.map((g) => g.id)).toEqual(all.slice(6, 12).map((g) => g.id));
    const last = await search({ limit: 6, pos: 12 });
    expect(last.results).toHaveLength(4);
    expect(last.next).toBeNull();
  });

  it('clamps and tolerates bad limit values and ignores an unknown provider', async () => {
    expect((await search({ limit: 0 })).results).toHaveLength(1);
    expect((await search({ limit: 500 })).results).toHaveLength(16);
    expect((await search({ limit: 'abc' })).results).toHaveLength(16);
    expect((await search({ pos: -5, limit: 2 })).results).toHaveLength(2);
    const res = await search({ provider: 'giphy' });
    expect(res.provider).toBe('tenor');
  });
});

import { buildPage, decodeCursor, encodeCursor } from '../../src/common/pagination/cursor';

describe('pagination/cursor', () => {
  it('round-trips a cursor through encode/decode', () => {
    const cursor = { createdAt: '2026-05-16T00:00:00.000Z', id: 'cln1abcde' };
    const encoded = encodeCursor(cursor);
    expect(decodeCursor(encoded)).toEqual(cursor);
  });

  it('returns null for an empty input', () => {
    expect(decodeCursor(undefined)).toBeNull();
    expect(decodeCursor(null)).toBeNull();
  });

  it('throws on malformed cursor payload', () => {
    expect(() => decodeCursor('this-is-not-base64-json')).toThrow();
  });

  it('builds a page envelope and signals hasMore correctly', () => {
    const now = new Date();
    const rows = Array.from({ length: 11 }, (_, i) => ({
      id: `id_${i}`,
      createdAt: new Date(now.getTime() - i * 1000),
    }));
    const page = buildPage(rows, 10);
    expect(page.items).toHaveLength(10);
    expect(page.hasMore).toBe(true);
    expect(page.nextCursor).not.toBeNull();
  });

  it('flags hasMore=false when the result fits in one page', () => {
    const rows = Array.from({ length: 3 }, (_, i) => ({
      id: `id_${i}`,
      createdAt: new Date(),
    }));
    const page = buildPage(rows, 10);
    expect(page.items).toHaveLength(3);
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeNull();
  });
});

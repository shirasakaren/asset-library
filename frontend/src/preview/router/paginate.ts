const MIN_LIMIT = 1;
const MAX_LIMIT = 100;

const clampLimit = (n: number) => Math.min(MAX_LIMIT, Math.max(MIN_LIMIT, n));

function encodeCursor(id: string): string {
  const bytes = new TextEncoder().encode(id);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function decodeCursor(cursor: string): string | null {
  try {
    const bin = atob(cursor);
    return new TextDecoder('utf-8', { fatal: true }).decode(
      Uint8Array.from(bin, (c) => c.charCodeAt(0)),
    );
  } catch {
    return null;
  }
}

/**
 * Cursor pagination over an already-sorted list. The cursor is the opaque
 * base64 of the last returned id, so callers must sort with a total order
 * (ties broken by id). An unknown or malformed cursor restarts from the top.
 */
export function paginate<T extends { id: string }>(
  items: T[],
  query: URLSearchParams,
  limitDefault = 24,
): { items: T[]; pageInfo: { nextCursor: string | null; hasMore: boolean } } {
  const parsed = Number.parseInt(query.get('limit') ?? '', 10);
  const limit = clampLimit(Number.isFinite(parsed) ? parsed : limitDefault);

  let start = 0;
  const cursor = query.get('cursor');
  if (cursor) {
    const lastId = decodeCursor(cursor);
    const idx = lastId === null ? -1 : items.findIndex((x) => x.id === lastId);
    if (idx >= 0) start = idx + 1;
  }

  const page = items.slice(start, start + limit);
  const hasMore = start + limit < items.length;
  return {
    items: page,
    pageInfo: {
      nextCursor: hasMore && page.length > 0 ? encodeCursor(page[page.length - 1]!.id) : null,
      hasMore,
    },
  };
}

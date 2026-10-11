const MIN_LIMIT = 1;
const MAX_LIMIT = 100;

const clampLimit = (n: number) => Math.min(MAX_LIMIT, Math.max(MIN_LIMIT, n));

interface CursorPayload {
  /** last returned id */
  id: string;
  /** its index in the list when the cursor was issued */
  i: number;
}

/** base64url (RFC 4648 section 5, no padding) so the cursor is safe in a query string. */
function encodeCursor(payload: CursorPayload): string {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeCursor(cursor: string): CursorPayload | null {
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(cursor)) return null;
    const b64 = cursor.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    const json = new TextDecoder('utf-8', { fatal: true }).decode(
      Uint8Array.from(bin, (c) => c.charCodeAt(0)),
    );
    const v = JSON.parse(json) as unknown;
    if (!v || typeof v !== 'object') return null;
    const { id, i } = v as Record<string, unknown>;
    if (typeof id !== 'string' || typeof i !== 'number' || !Number.isInteger(i) || i < 0) {
      return null;
    }
    return { id, i };
  } catch {
    return null;
  }
}

/**
 * Cursor pagination over an already-sorted list. The cursor is an opaque
 * base64url encoding of the last returned `{ id, i }`, so callers must sort with
 * a total order (ties broken by id). If the last id has since disappeared the
 * page resumes at its old index (never repeating items); a malformed or forged
 * cursor yields an empty page.
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
    const decoded = decodeCursor(cursor);
    if (!decoded) return { items: [], pageInfo: { nextCursor: null, hasMore: false } };
    const idx = items.findIndex((x) => x.id === decoded.id);
    start = idx >= 0 ? idx + 1 : Math.min(decoded.i, items.length);
  }

  const page = items.slice(start, start + limit);
  const hasMore = start + limit < items.length;
  return {
    items: page,
    pageInfo: {
      nextCursor:
        hasMore && page.length > 0
          ? encodeCursor({ id: page[page.length - 1]!.id, i: start + page.length - 1 })
          : null,
      hasMore,
    },
  };
}

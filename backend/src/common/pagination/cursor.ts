import { BadRequestException } from '@nestjs/common';

/**
 * Cursor pagination helpers. Cursors are base64url-encoded JSON of
 * `{ createdAt, id }`. Lists ordered by `(createdAt DESC, id DESC)` are stable
 * because the secondary `id` ordering breaks ties.
 */

export interface PaginationCursor {
  createdAt: string;
  id: string;
}

export interface PaginatedResponseDto<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export function encodeCursor(cursor: PaginationCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeCursor(raw: string | undefined | null): PaginationCursor | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (typeof parsed.createdAt !== 'string' || typeof parsed.id !== 'string') {
      throw new Error('cursor payload is malformed');
    }
    return parsed;
  } catch (err) {
    throw new BadRequestException(`Invalid cursor: ${(err as Error).message}`);
  }
}

/**
 * Builds a paginated envelope from a result set that was queried with `take`
 * one higher than the requested page size, so we can detect `hasMore` without
 * a separate count query.
 */
export function buildPage<T extends { id: string; createdAt: Date }>(
  rows: T[],
  pageSize: number,
): PaginatedResponseDto<T> {
  const hasMore = rows.length > pageSize;
  const items = hasMore ? rows.slice(0, pageSize) : rows;
  const last = items[items.length - 1];
  const nextCursor =
    hasMore && last ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id }) : null;
  return { items, nextCursor, hasMore };
}

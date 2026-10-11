import type { AdminStorageAssetRow, AdminStorageUserRow } from '@/lib/api/admin-types';
import type { UserRecord } from '../../records';
import { badRequest } from '../../router/errors';
import type { PreviewRequest } from '../../router/router';
import { adminRoute, cmpStr, dayOf } from './common';
import { loadStorageModel, sparkFor, bytesOn, type AssetStorage } from './storage-core';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/** The backend's `Math.min(Math.max(Number(limit ?? '50'), 1), 200)`; garbage means the default. */
function limitOf(query: URLSearchParams): number {
  const n = Number(query.get('limit') ?? DEFAULT_LIMIT);
  if (!Number.isFinite(n)) return DEFAULT_LIMIT;
  return Math.min(Math.max(Math.floor(n), 1), MAX_LIMIT);
}

/**
 * The day the page asks about: `date` (the page sends today's date), an empty value or none
 * meaning today, and a day after today counting as today (nothing exists beyond the clock).
 * A malformed value is a 400.
 */
function dayParam(req: PreviewRequest, today: string): string {
  const raw = (req.query.get('date') ?? '').trim();
  if (!raw) return today;
  const ms = Date.parse(raw);
  if (!/^\d{4}-\d{2}-\d{2}/.test(raw) || Number.isNaN(ms)) {
    throw badRequest('date must be an ISO-8601 date.', {
      fields: [{ path: 'date', code: 'invalid', message: 'date must be an ISO-8601 date.' }],
    });
  }
  const day = dayOf(new Date(ms));
  return day > today ? today : day;
}

const MISSING_USER = 'Unknown user';

/**
 * Per-asset usage: the seeded rollup (value of `date` read off the stored 30-day spark; after the
 * snapshot day the last value) plus the bytes of files the visitor uploaded, which only count for
 * days after the snapshot. Only rows with bytes on that day are listed (an asset that did not exist
 * yet has none). Bytes descending, `id` ascending on ties, at most `limit`. DRAFT and ARCHIVED
 * assets are included, DELETED ones are not.
 */
adminRoute('GET', '/admin/storage/assets', async (req, ctx): Promise<AdminStorageAssetRow[]> => {
  const model = await loadStorageModel(ctx);
  const users = new Map((await ctx.db.list<UserRecord>('users')).map((u) => [u.id, u]));
  const end = dayParam(req, dayOf(ctx.now()));
  return model.rows
    .map((row) => ({ row, bytes: bytesOn(row, end, model.asOf) }))
    .filter((x) => x.bytes > 0)
    .sort((a, b) => b.bytes - a.bytes || cmpStr(a.row.asset.id, b.row.asset.id))
    .slice(0, limitOf(req.query))
    .map(({ row, bytes }) => ({
      assetId: row.asset.id,
      slug: row.asset.slug,
      title: row.asset.title,
      ownerDisplayName: users.get(row.asset.ownerId)?.displayName ?? MISSING_USER,
      bytes,
      spark: sparkFor([row], end, model.asOf),
    }));
});

/**
 * Per-user usage, derived from each owner's CURRENT assets (the seed keeps `user = sum of its
 * assets`, so at seed time this equals the stored user rollups, and it follows transfers, deletes
 * and uploads). Same date, sorting and limit rules as the asset list.
 */
adminRoute('GET', '/admin/storage/users', async (req, ctx): Promise<AdminStorageUserRow[]> => {
  const model = await loadStorageModel(ctx);
  const users = new Map((await ctx.db.list<UserRecord>('users')).map((u) => [u.id, u]));
  const end = dayParam(req, dayOf(ctx.now()));
  const byOwner = new Map<string, AssetStorage[]>();
  for (const row of model.rows) {
    const list = byOwner.get(row.asset.ownerId) ?? [];
    list.push(row);
    byOwner.set(row.asset.ownerId, list);
  }
  return [...byOwner.entries()]
    .map(([userId, rows]) => ({
      userId,
      rows,
      bytes: rows.reduce((sum, r) => sum + bytesOn(r, end, model.asOf), 0),
    }))
    .filter((x) => x.bytes > 0)
    .sort((a, b) => b.bytes - a.bytes || cmpStr(a.userId, b.userId))
    .slice(0, limitOf(req.query))
    .map(({ userId, rows, bytes }) => ({
      userId,
      displayName: users.get(userId)?.displayName ?? MISSING_USER,
      email: users.get(userId)?.email ?? '',
      bytes,
      spark: sparkFor(rows, end, model.asOf),
    }));
});

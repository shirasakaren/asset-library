import type { AssetRecord, CommentRecord, FeaturedRecord, UserRecord } from '../../records';
import { badRequest, notFound } from '../../router/errors';
import type { PreviewContext } from '../../router/router';
import { adjustTagUsage, isoSeconds } from '../asset-write-core';
import { recordAudit } from '../audit-core';
import { discardFileBlob } from '../upload-core';
import { serialized } from '../write-queue';
import { adminRoute, parseReason } from './common';
import { findAnyAsset, findLiveAsset } from './assets';

/**
 * Hard delete (`@RequireConfirmation`: `confirm: "I understand"` + a `confirmedAt` no older than a
 * minute, checked before anything else, then `reason` 4..500 characters). Removes the asset and what
 * depends on it, like the backend's cascades:
 *  - its versions and files (and the stored bytes of files the visitor uploaded),
 *  - comments and replies, the library entry, featured slots,
 *  - the analytics rollup row of the asset (`an-<id>`),
 *  - one tag usage per tag, unless it was already soft-deleted (that already released them).
 * Kept on purpose: the seeded storage row `st-asset-<id>` (it is what lets the dashboard `source`
 * bucket subtract the asset's seeded bytes, exactly once, whether it was live or already soft-deleted;
 * every storage list is derived from the assets that exist, so the orphan row never shows),
 * notifications (no relation in the backend) and reports (the backend has no
 * cascade either; readers must cope with a report whose asset is gone). `an-platform`, the user
 * rollups and the bucket rollups are derived at read time, so they follow without a write.
 */
adminRoute(
  'POST',
  '/admin/assets/{id}/force-delete',
  (req, ctx) => {
    const reason = parseReason(req.body, { required: true });
    return serialized(async () => {
      const asset = findAnyAsset(await ctx.db.list<AssetRecord>('assets'), req.params.id!);
      await purgeAsset(ctx, asset);
      await recordAudit(ctx, {
        action: 'asset.force_delete',
        subjectType: 'Asset',
        subjectId: asset.id,
        metadata: { reason, previousStatus: asset.status, ownerId: asset.ownerId },
      });
      ctx.emit({ type: 'assets.changed' });
      return undefined;
    });
  },
  { confirm: true },
);

/** The cascade of a hard delete (see the route). Call inside `serialized`. */
export async function purgeAsset(ctx: PreviewContext, asset: AssetRecord): Promise<void> {
  for (const v of asset.versions) {
    for (const f of v.files) {
      try {
        await discardFileBlob(f);
      } catch {
        // best effort: a blob store that is unavailable must not block the delete
      }
    }
  }
  const comments = await ctx.db.list<CommentRecord>('comments');
  for (const c of comments) if (c.assetId === asset.id) await ctx.db.remove('comments', c.id);
  if (await ctx.db.get('library', asset.id)) await ctx.db.remove('library', asset.id);
  const slots = await ctx.db.list<FeaturedRecord>('featured');
  for (const s of slots) if (s.assetId === asset.id) await ctx.db.remove('featured', s.id);
  if (await ctx.db.get('analytics', `an-${asset.id}`)) {
    await ctx.db.remove('analytics', `an-${asset.id}`);
  }
  if (asset.status !== 'DELETED') await adjustTagUsage(ctx, asset.tagIds, -1);
  await ctx.db.remove('assets', asset.id);
}

/**
 * Reassigns ownership to another user (`newOwnerId`, any existing user). Not confirmation-gated in
 * the backend (the modal still sends the confirmation fields, which are ignored); an optional
 * `reason` is kept in the audit row. Audit: `asset.transfer` `{ fromOwnerId, toOwnerId, reason? }`
 * (the seeded rows' shape). Owner-derived data (profile counts, `hasPublishedAssets`, storage per
 * user) follows because it is computed from `ownerId`.
 */
adminRoute('POST', '/admin/assets/{id}/transfer', (req, ctx) => {
  const body =
    typeof req.body === 'object' && req.body !== null && !Array.isArray(req.body)
      ? (req.body as Record<string, unknown>)
      : {};
  const newOwnerId = body.newOwnerId;
  if (typeof newOwnerId !== 'string' || !newOwnerId.trim()) {
    throw badRequest('newOwnerId must be a string.', {
      fields: [{ path: 'newOwnerId', code: 'invalid', message: 'newOwnerId must be a string.' }],
    });
  }
  const reason = parseReason(req.body, { required: false });
  return serialized(async () => {
    const asset = findLiveAsset(await ctx.db.list<AssetRecord>('assets'), req.params.id!);
    const target = await ctx.db.get<UserRecord>('users', newOwnerId);
    if (!target) throw notFound(`User ${newOwnerId} not found.`, { code: 'user.not_found' });
    await ctx.db.patch<AssetRecord>('assets', asset.id, {
      ownerId: target.id,
      updatedAt: isoSeconds(ctx),
    });
    await recordAudit(ctx, {
      action: 'asset.transfer',
      subjectType: 'Asset',
      subjectId: asset.id,
      metadata: reason
        ? { fromOwnerId: asset.ownerId, toOwnerId: target.id, reason }
        : { fromOwnerId: asset.ownerId, toOwnerId: target.id },
    });
    ctx.emit({ type: 'assets.changed' });
    return undefined;
  });
});

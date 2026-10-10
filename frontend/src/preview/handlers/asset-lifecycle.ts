import type { AssetRecord, AuditRecord } from '../records';
import type { PreviewContext } from '../router/router';
import { badRequest } from '../router/errors';
import { recordAudit } from './audit-core';
import { adjustTagUsage, isoSeconds, type Writable } from './asset-write-core';

export const archiveBlocked = (message: string) =>
  badRequest(message, { code: 'asset.archive_blocked' });

const emit = (ctx: PreviewContext) => ctx.emit({ type: 'assets.changed' });

/** PUBLISHED to ARCHIVED (400 `asset.archive_blocked` otherwise). Call inside `serialized`. */
export async function archiveAsset(ctx: PreviewContext, asset: AssetRecord): Promise<void> {
  if (asset.status !== 'PUBLISHED') {
    throw archiveBlocked('Only a published asset can be archived.');
  }
  await ctx.db.patch<AssetRecord>('assets', asset.id, {
    status: 'ARCHIVED',
    updatedAt: isoSeconds(ctx),
  });
  emit(ctx);
}

/**
 * ARCHIVED to PUBLISHED. With `allowDeleted` (the admin route, like the backend) a soft-deleted
 * asset comes back too: PUBLISHED when it had been published, else DRAFT (restoring a never
 * published asset straight to PUBLISHED would skip the checklist), and its tags are counted again.
 */
export async function restoreAsset(
  ctx: PreviewContext,
  asset: AssetRecord,
  opts: { allowDeleted?: boolean } = {},
): Promise<void> {
  const now = isoSeconds(ctx);
  if (asset.status === 'ARCHIVED') {
    await ctx.db.patch<AssetRecord>('assets', asset.id, {
      status: 'PUBLISHED',
      publishedAt: asset.publishedAt ?? now,
      updatedAt: now,
    });
  } else if (asset.status === 'DELETED' && opts.allowDeleted) {
    await ctx.db.patch<AssetRecord>('assets', asset.id, {
      status: asset.publishedAt ? 'PUBLISHED' : 'DRAFT',
      updatedAt: now,
    });
    await adjustTagUsage(ctx, asset.tagIds, 1);
  } else {
    throw archiveBlocked('Asset is not archived.');
  }
  emit(ctx);
}

/** Soft delete: status DELETED (404 everywhere), tag usage released. */
export async function softDeleteAsset(ctx: PreviewContext, asset: AssetRecord): Promise<void> {
  await ctx.db.patch<AssetRecord>('assets', asset.id, {
    status: 'DELETED',
    updatedAt: isoSeconds(ctx),
  });
  await adjustTagUsage(ctx, asset.tagIds, -1);
  emit(ctx);
}

/** The admin is acting on somebody else's asset (not their own). */
export const isAdminAction = (w: Writable): boolean =>
  w.viewer.isAdmin && w.asset.ownerId !== w.viewer.id;

/**
 * Audit row for an admin acting on another owner's asset through the user-facing routes (the admin
 * screens archive, restore, delete and edit through `/assets/{id}...`). Nothing for owners acting on
 * their own assets, or an admin on theirs: those are not admin actions in the backend either.
 */
export async function auditAdminAction(
  ctx: PreviewContext,
  w: Writable,
  action: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  if (!isAdminAction(w)) return;
  await recordAudit(ctx, { action, subjectType: 'Asset', subjectId: w.asset.id, metadata });
}

/** How long consecutive wizard saves of one asset fold into a single audit row. */
const EDIT_COALESCE_MS = 10 * 60 * 1000;

/**
 * `asset.admin_edit` for the wizard's autosaves: the wizard patches on every debounced keystroke, so
 * a save that follows the newest audit row of the same admin and asset (within 10 minutes) adds its
 * fields to that row instead of appending a new one. One editing session is one row.
 */
export async function auditAdminEdit(
  ctx: PreviewContext,
  w: Writable,
  changed: string[],
): Promise<void> {
  if (!isAdminAction(w) || changed.length === 0) return;
  const rows = await ctx.db.list<AuditRecord>('audit');
  let newest: AuditRecord | undefined;
  for (const r of rows) {
    if (
      !newest ||
      r.createdAt > newest.createdAt ||
      (r.createdAt === newest.createdAt && r.id > newest.id)
    ) {
      newest = r;
    }
  }
  const age = newest ? ctx.now().getTime() - Date.parse(newest.createdAt) : Infinity;
  if (
    newest &&
    newest.action === 'asset.admin_edit' &&
    newest.subjectId === w.asset.id &&
    newest.actorId === w.viewer.id &&
    age <= EDIT_COALESCE_MS
  ) {
    const meta = (newest.metadata ?? {}) as { fields?: string[] };
    const fields = [...new Set([...(meta.fields ?? []), ...changed])];
    await ctx.db.patch<AuditRecord>('audit', newest.id, {
      metadata: { ...meta, fields },
    });
    return;
  }
  await recordAudit(ctx, {
    action: 'asset.admin_edit',
    subjectType: 'Asset',
    subjectId: w.asset.id,
    metadata: { fields: changed },
  });
}

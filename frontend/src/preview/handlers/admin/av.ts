import type { AdminAvRow } from '@/lib/api/admin-types';
import type { AssetRecord, AssetVersionRecord, UserRecord } from '../../records';
import { conflict, notFound } from '../../router/errors';
import type { PreviewContext } from '../../router/router';
import type { Db } from '../../types';
import { archiveAsset } from '../asset-lifecycle';
import { isoSeconds } from '../asset-write-core';
import { recordAudit } from '../audit-core';
import { serialized } from '../write-queue';
import { adminRoute, cmpStr } from './common';

/** How long the simulated scanner takes to answer a rescan. */
export const SCHEDULED_RESCAN_MS = 2000;

const SUBJECT = 'AssetVersion';

const versionNotFound = (id: string) =>
  notFound(`Version ${id} not found.`, { code: 'version.not_found' });

const notInfected = (id: string) =>
  conflict(`Version ${id} is not flagged by the virus scan.`, { code: 'av.not_infected' });

interface Found {
  asset: AssetRecord;
  version: AssetVersionRecord;
}

/** A version of a live (not soft-deleted) asset, or a 404. */
async function findVersion(ctx: PreviewContext, versionId: string): Promise<Found> {
  for (const asset of await ctx.db.list<AssetRecord>('assets')) {
    if (asset.status === 'DELETED') continue;
    const version = asset.versions.find((v) => v.id === versionId);
    if (version) return { asset, version };
  }
  throw versionNotFound(versionId);
}

/** Rewrites one version of an asset (the whole `versions` array is replaced). */
const patchVersion = (
  ctx: PreviewContext,
  asset: AssetRecord,
  versionId: string,
  partial: Partial<AssetVersionRecord>,
) =>
  ctx.db.patch<AssetRecord>('assets', asset.id, {
    versions: asset.versions.map((v) => (v.id === versionId ? { ...v, ...partial } : v)),
  });

/**
 * The AV queue: every INFECTED version of a live asset (an archived, i.e. quarantined, one stays
 * until an admin acknowledges it or a rescan clears it), newest version first. The version rows
 * carry the asset, its owner and the scanned files. The backend source has no controller for the
 * `/admin/av/*` routes (the OpenAPI file lists them), so the row shape is the preview's own
 * (`AdminAvRow`); no screen reads it yet.
 */
adminRoute('GET', '/admin/av/infected', async (_req, ctx): Promise<AdminAvRow[]> => {
  const [assets, users] = await Promise.all([
    ctx.db.list<AssetRecord>('assets'),
    ctx.db.list<UserRecord>('users'),
  ]);
  const owners = new Map(users.map((u) => [u.id, u]));
  const rows: AdminAvRow[] = [];
  for (const a of assets) {
    if (a.status === 'DELETED') continue;
    for (const v of a.versions) {
      if (v.avStatus !== 'INFECTED') continue;
      const owner = owners.get(a.ownerId);
      rows.push({
        versionId: v.id,
        semver: v.semver,
        avStatus: v.avStatus,
        acknowledgedAt: v.avAcknowledgedAt,
        createdAt: v.createdAt,
        assetId: a.id,
        assetSlug: a.slug,
        assetTitle: a.title,
        assetStatus: a.status,
        ownerId: a.ownerId,
        ownerDisplayName: owner?.displayName ?? '(unknown)',
        ownerEmail: owner?.email ?? null,
        files: v.files.map((f) => ({ id: f.id, relativePath: f.relativePath, bytes: f.bytes })),
      });
    }
  }
  return rows.sort((a, b) => cmpStr(b.createdAt, a.createdAt) || cmpStr(b.versionId, a.versionId));
});

/**
 * "Archive the parent asset with reason = AV quarantine". A published asset is archived (the same
 * path as the admin archive, audit `asset.admin_archive { previousStatus, reason: 'AV quarantine' }`),
 * an archived one stays as it is, a draft cannot be archived (400 `asset.archive_blocked`). The version
 * stays INFECTED: the stat card counts it until it is acknowledged or a rescan clears it. 409
 * `av.not_infected` for a version that is not flagged. Audit `av.quarantine { assetId }`.
 */
adminRoute('POST', '/admin/av/{versionId}/quarantine', (req, ctx) =>
  serialized(async () => {
    const id = req.params.versionId!;
    const { asset, version } = await findVersion(ctx, id);
    if (version.avStatus !== 'INFECTED') throw notInfected(id);
    if (asset.status !== 'ARCHIVED') {
      await archiveAsset(ctx, asset);
      await recordAudit(ctx, {
        action: 'asset.admin_archive',
        subjectType: 'Asset',
        subjectId: asset.id,
        metadata: { previousStatus: asset.status, reason: 'AV quarantine' },
      });
    }
    await recordAudit(ctx, {
      action: 'av.quarantine',
      subjectType: SUBJECT,
      subjectId: id,
      metadata: { assetId: asset.id },
    });
    return undefined;
  }),
);

/**
 * "Mark a false positive - flips avStatus to CLEAN": the version becomes CLEAN with
 * `avAcknowledgedAt` = now, so downloads work again and the dashboard's `avInfected` drops it. 409
 * `av.not_infected` for a version that is not flagged. Audit `av.acknowledge { assetId }`.
 */
adminRoute('POST', '/admin/av/{versionId}/acknowledge', (req, ctx) =>
  serialized(async () => {
    const id = req.params.versionId!;
    const { asset, version } = await findVersion(ctx, id);
    if (version.avStatus !== 'INFECTED') throw notInfected(id);
    await patchVersion(ctx, asset, id, {
      avStatus: 'CLEAN',
      avAcknowledgedAt: ctx.now().toISOString(),
    });
    await ctx.db.patch<AssetRecord>('assets', asset.id, { updatedAt: isoSeconds(ctx) });
    await recordAudit(ctx, {
      action: 'av.acknowledge',
      subjectType: SUBJECT,
      subjectId: id,
      metadata: { assetId: asset.id },
    });
    ctx.emit({ type: 'assets.changed' });
    return undefined;
  }),
);

const pending = new WeakMap<Db, Set<string>>();

/**
 * STUB for the AV worker: after 2 s the version scans CLEAN (the demo files are `.txt` link files
 * and uploads are never executed, so the real scanner would find nothing) and
 * `{ type: 'assets.changed' }` goes on the bus. Returns `true` when a timer was scheduled; `false`
 * when `ctx.timers` is off (tests) or a scan is already pending for that version. Whether the version
 * still exists is decided when the timer fires, so deleting the asset or resetting the demo in
 * between is harmless.
 */
function scheduleRescan(ctx: PreviewContext, versionId: string): boolean {
  if (!ctx.timers) return false;
  let keys = pending.get(ctx.db);
  if (!keys) {
    keys = new Set();
    pending.set(ctx.db, keys);
  }
  if (keys.has(versionId)) return false;
  keys.add(versionId);
  const owner = keys;
  setTimeout(() => {
    owner.delete(versionId);
    void finishRescan(ctx, versionId).catch((err) => {
      console.error('[preview] AV rescan failed', versionId, err);
    });
  }, SCHEDULED_RESCAN_MS);
  return true;
}

function finishRescan(ctx: PreviewContext, versionId: string): Promise<void> {
  return serialized(async () => {
    let found: Found;
    try {
      found = await findVersion(ctx, versionId);
    } catch {
      return;
    }
    const { asset, version } = found;
    if (version.avStatus === 'CLEAN' && !version.avAcknowledgedAt) return;
    await patchVersion(ctx, asset, versionId, { avStatus: 'CLEAN', avAcknowledgedAt: null });
    ctx.emit({ type: 'assets.changed' });
  });
}

/**
 * "Re-enqueue AV scan for every file in this version": 204 at once, the result lands 2 s later
 * (`scheduleRescan`). Any version of a live asset can be rescanned; a clean one stays clean.
 * Audit `av.rescan { assetId }`.
 */
adminRoute('POST', '/admin/av/{versionId}/rescan', (req, ctx) =>
  serialized(async () => {
    const id = req.params.versionId!;
    const { asset } = await findVersion(ctx, id);
    await recordAudit(ctx, {
      action: 'av.rescan',
      subjectType: SUBJECT,
      subjectId: id,
      metadata: { assetId: asset.id },
    });
    scheduleRescan(ctx, id);
    return undefined;
  }),
);

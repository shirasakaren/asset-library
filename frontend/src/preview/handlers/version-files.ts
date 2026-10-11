import type { FileKind } from '@/lib/api/types';
import type { AssetFileRecord, AssetRecord, AssetVersionRecord } from '../records';
import type { PreviewContext } from '../router/router';
import { badRequest, notFound } from '../router/errors';
import { detectFileKind } from './file-kinds';
import { isoSeconds, loadWritable } from './asset-write-core';
import { scheduleAnalysis } from './version-analysis';
import { recomputeVersionTotals } from './version-core';
import { serialized } from './write-queue';

export const versionNotFound = (id: string) =>
  notFound(`Version ${id} not found.`, { code: 'version.not_found' });

/**
 * Read-modify-write of one version, under the write queue and with the owner/admin check
 * (404 / 403 like every asset write). `fn` may change the version it is given (a private copy)
 * and returns `false` to skip the write; otherwise the asset's `updatedAt` is bumped and
 * `assets.changed` is announced. Returns the stored asset.
 */
export function mutateVersion(
  ctx: PreviewContext,
  assetId: string,
  versionId: string,
  fn: (version: AssetVersionRecord, asset: AssetRecord) => void | false | Promise<void | false>,
): Promise<AssetRecord> {
  return serialized(() => mutateVersionNow(ctx, assetId, versionId, fn));
}

/** Same as `mutateVersion` for callers already inside `serialized` (which must not nest). */
export async function mutateVersionNow(
  ctx: PreviewContext,
  assetId: string,
  versionId: string,
  fn: (version: AssetVersionRecord, asset: AssetRecord) => void | false | Promise<void | false>,
): Promise<AssetRecord> {
  const { asset } = await loadWritable(ctx, assetId);
  const version = asset.versions.find((v) => v.id === versionId);
  if (!version) throw versionNotFound(versionId);
  if ((await fn(version, asset)) === false) return asset;
  const updated = await ctx.db.patch<AssetRecord>('assets', asset.id, {
    versions: asset.versions,
    updatedAt: isoSeconds(ctx),
  });
  ctx.emit({ type: 'assets.changed' });
  return updated;
}

export interface NewVersionFile {
  id: string;
  relativePath: string;
  /** Defaults to `detectFileKind(relativePath)`. */
  kind?: FileKind | string;
  /** Size in bytes: a non-negative integer or its decimal string. */
  bytes: number | string;
  meta?: Record<string, unknown>;
}

const fileError = (path: string, message: string) =>
  badRequest(message, { fields: [{ path, code: 'invalid', message }] });

function normalizeFile(file: NewVersionFile): AssetFileRecord {
  if (typeof file.id !== 'string' || !file.id) throw fileError('file.id', 'file.id is required.');
  if (typeof file.relativePath !== 'string' || !file.relativePath) {
    throw fileError('file.relativePath', 'file.relativePath is required.');
  }
  const bytes = typeof file.bytes === 'number' ? String(file.bytes) : file.bytes;
  if (typeof bytes !== 'string' || !/^\d+$/.test(bytes)) {
    throw fileError('file.bytes', 'file.bytes must be a non-negative integer.');
  }
  // `AssetFileRecord.meta` is typed as the seed's `{ content }` link text; an upload has no such
  // text (its bytes live in the blob store), so `meta` is only set when the caller passes one.
  const out = {
    id: file.id,
    relativePath: file.relativePath,
    kind: file.kind || detectFileKind(file.relativePath),
    bytes,
  } as AssetFileRecord;
  if (file.meta) out.meta = file.meta as AssetFileRecord['meta'];
  return out;
}

/**
 * Adds an uploaded file to a version (for the upload `complete` handler): the row is appended
 * (an existing row with the same id is replaced, so a repeated `complete` is harmless), totals
 * are recomputed, `updatedAt` bumped and `assets.changed` emitted. The version goes back to
 * `PENDING` and `scheduleAnalysis` runs (a no-op when `ctx.timers` is false), because new content
 * has to be analysed again. Owner or admin only. Do not call from inside `serialized`.
 */
export async function attachFileToVersion(
  ctx: PreviewContext,
  args: { assetId: string; versionId: string; file: NewVersionFile },
): Promise<AssetFileRecord> {
  const record = normalizeFile(args.file);
  const asset = await mutateVersion(ctx, args.assetId, args.versionId, (version) => {
    const at = version.files.findIndex((f) => f.id === record.id);
    if (at >= 0) version.files[at] = record;
    else version.files.push(record);
    recomputeVersionTotals(version);
    version.analysisStatus = 'PENDING';
  });
  scheduleAnalysis(ctx, asset.id, args.versionId);
  return record;
}

/**
 * Removes a file from whichever version holds it and recomputes that version's totals.
 * 404 `file.not_found` when no asset has it; owner or admin only. Do not call from inside
 * `serialized`.
 */
export function removeFileFromVersion(
  ctx: PreviewContext,
  args: { fileId: string },
): Promise<void> {
  return serialized(async () => {
    const assets = await ctx.db.list<AssetRecord>('assets');
    const owner = assets.find(
      (a) =>
        a.status !== 'DELETED' && a.versions.some((v) => v.files.some((f) => f.id === args.fileId)),
    );
    if (!owner) throw notFound(`File ${args.fileId} not found.`, { code: 'file.not_found' });
    const version = owner.versions.find((v) => v.files.some((f) => f.id === args.fileId))!;
    await mutateVersionNow(ctx, owner.id, version.id, (v) => {
      v.files = v.files.filter((f) => f.id !== args.fileId);
      recomputeVersionTotals(v);
    });
  });
}

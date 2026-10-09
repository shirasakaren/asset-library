import type { AssetFileRecord, AssetRecord } from '../records';
import { route } from '../router/router';
import { notFound } from '../router/errors';
import { discardFileBlob, invalid, isObject } from './upload-core';
import { mutateVersion, removeFileFromVersion } from './versions';

/** File management on an existing version: display order and deletion (`/files/...`). */

/**
 * New display order of a version's files. Like the backend: ids not in the list keep their
 * relative order after the listed ones, unknown ids are ignored. Owner or admin only.
 */
route('POST', '/files/versions/{versionId}/reorder', async (req, ctx) => {
  const versionId = req.params.versionId!;
  if (!isObject(req.body) || !Array.isArray(req.body.orderedFileIds)) {
    throw invalid('orderedFileIds', 'orderedFileIds must be an array of file ids.');
  }
  const ordered = req.body.orderedFileIds;
  if (ordered.some((id) => typeof id !== 'string')) {
    throw invalid('orderedFileIds', 'orderedFileIds must be an array of file ids.');
  }
  const assets = await ctx.db.list<AssetRecord>('assets');
  const asset = assets.find(
    (a) => a.status !== 'DELETED' && a.versions.some((v) => v.id === versionId),
  );
  if (!asset) throw notFound(`Version ${versionId} not found.`, { code: 'version.not_found' });

  const rank = new Map<string, number>();
  (ordered as string[]).forEach((id, i) => {
    if (!rank.has(id)) rank.set(id, i);
  });
  await mutateVersion(ctx, asset.id, versionId, (version) => {
    const sorted = [...version.files].sort(
      (a, b) => (rank.get(a.id) ?? ordered.length) - (rank.get(b.id) ?? ordered.length),
    );
    if (sorted.every((f, i) => f === version.files[i])) return false;
    version.files = sorted;
  });
  return undefined;
});

/**
 * Deletes one file of a version (owner or admin): the row, the version totals and the stored
 * bytes. Deleting the last file keeps the version; the publish checklist then reports
 * `version.files`.
 */
route('DELETE', '/files/{fileId}', async (req, ctx) => {
  const fileId = req.params.fileId!;
  let file: AssetFileRecord | undefined;
  for (const a of await ctx.db.list<AssetRecord>('assets')) {
    if (a.status === 'DELETED') continue;
    for (const v of a.versions) file ??= v.files.find((f) => f.id === fileId);
  }
  await removeFileFromVersion(ctx, { fileId });
  if (file) await discardFileBlob(file);
  return undefined;
});

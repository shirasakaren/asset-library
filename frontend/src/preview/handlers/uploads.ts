import type { AssetFileRecord, AssetRecord } from '../records';
import { route, type PreviewContext } from '../router/router';
import { badRequest, notFound } from '../router/errors';
import { BLOB_STORE_MAX_BYTES, getBlobStore } from '../uploads/blob-store';
import { detectFileKind } from './file-kinds';
import {
  dropHandle,
  expiresAtIso,
  invalid,
  isObject,
  loadHandle,
  loadWritableVersion,
  newUploadId,
  parseInitiate,
  partBlobId,
  previewPutUrl,
  pruneHandles,
  saveHandle,
  type UploadHandle,
  type UploadMeta,
} from './upload-core';
import { attachFileToVersion } from './versions';
import './uploads-media';
import './files-manage';

/**
 * Package-file uploads (`/files/uploads/*`): single shot and multipart. See `upload-core.ts` for
 * the model. Like the backend, any version of an asset the persona may edit takes uploads (the
 * wizard's "Update" flow adds files to a published version); unlike it, the file row appears at
 * `complete`, not at `initiate`.
 */

const alreadyDone = (id: string) =>
  notFound(`File of upload ${id} no longer exists.`, {
    code: 'file.upload_not_found',
  });

async function initiateUpload(
  ctx: PreviewContext,
  body: unknown,
  multipart: boolean,
): Promise<{ handle: UploadHandle; key: string }> {
  const input = parseInitiate(body, multipart);
  const { asset, version } = await loadWritableVersion(ctx, input.assetId, input.versionId);
  await pruneHandles(ctx);
  const handle: UploadHandle = {
    uploadId: newUploadId(ctx),
    kind: multipart ? 'multipart' : 'file',
    assetId: asset.id,
    versionId: version.id,
    fileId: ctx.newId('f'),
    relativePath: input.relativePath,
    contentType: input.contentType || 'application/octet-stream',
    bytes: input.bytes,
    ...(input.partCount ? { partCount: input.partCount } : {}),
    createdAt: ctx.now().toISOString(),
  };
  await saveHandle(ctx, handle);
  return { handle, key: `assets/${asset.id}/${version.id}/${input.relativePath}` };
}

/** The row a completed handle produced, if it is still there. */
async function findCompletedFile(
  ctx: PreviewContext,
  handle: UploadHandle,
): Promise<AssetFileRecord> {
  const asset = await ctx.db.get<AssetRecord>('assets', handle.assetId);
  const file = asset?.versions
    .find((v) => v.id === handle.versionId)
    ?.files.find((f) => f.id === handle.fileId);
  if (!file) throw alreadyDone(handle.uploadId);
  return file;
}

/** Records the file of a handle whose bytes (or metadata) are in the blob store. */
async function finishHandle(
  ctx: PreviewContext,
  handle: UploadHandle,
  stored: { size: number; stored: boolean } | undefined,
): Promise<AssetFileRecord> {
  if (handle.completedAt) return findCompletedFile(ctx, handle);
  // The version has to be (still) writable now, not only when the upload started.
  await loadWritableVersion(ctx, handle.assetId, handle.versionId);
  const upload: UploadMeta = {
    blobId: handle.uploadId,
    contentType: handle.contentType,
    stored: stored?.stored ?? false,
  };
  const record = await attachFileToVersion(ctx, {
    assetId: handle.assetId,
    versionId: handle.versionId,
    file: {
      id: handle.fileId,
      relativePath: handle.relativePath,
      kind: detectFileKind(handle.relativePath),
      bytes: stored ? stored.size : handle.bytes,
      meta: { upload },
    },
  });
  await saveHandle(ctx, { ...handle, completedAt: ctx.now().toISOString() });
  return record;
}

async function requireHandle(
  ctx: PreviewContext,
  body: unknown,
  kind: UploadHandle['kind'],
): Promise<UploadHandle> {
  if (!isObject(body) || typeof body.uploadId !== 'string' || body.uploadId === '') {
    throw invalid('uploadId', 'uploadId must be a non-empty string.');
  }
  const handle = await loadHandle(ctx, body.uploadId);
  if (handle.kind !== kind) {
    throw badRequest(
      kind === 'file' ? 'Wrong completion endpoint for this upload.' : 'Not a multipart upload.',
      { code: 'file.upload_init_failed' },
    );
  }
  return handle;
}

route('POST', '/files/uploads/initiate', async (req, ctx) => {
  const { handle, key } = await initiateUpload(ctx, req.body, false);
  return {
    uploadId: handle.uploadId,
    putUrl: previewPutUrl(handle.uploadId),
    key,
    fileId: handle.fileId,
    expiresAt: expiresAtIso(ctx),
  };
});

/**
 * One `complete` per upload at a time: a second call made while the first is running gets the
 * same result instead of racing it (the single-shot and the multipart variant both use this).
 */
const inflight = new Map<string, Promise<AssetFileRecord>>();
function once(uploadId: string, run: () => Promise<AssetFileRecord>): Promise<AssetFileRecord> {
  const running = inflight.get(uploadId);
  if (running) return running;
  const next = run().finally(() => inflight.delete(uploadId));
  inflight.set(uploadId, next);
  return next;
}

/**
 * Records the uploaded file (kind from the extension, size from the stored bytes, else the size
 * announced at initiate) and, through `attachFileToVersion`, resets the version to `PENDING` and
 * schedules the simulated analysis. Returns the `AssetFile` row (the backend answers 204; the UI
 * ignores the body). Safe to call twice.
 */
route('POST', '/files/uploads/complete', async (req, ctx) => {
  const handle = await requireHandle(ctx, req.body, 'file');
  return once(handle.uploadId, async () =>
    finishHandle(ctx, handle, await getBlobStore().get(handle.uploadId)),
  );
});

route('POST', '/files/uploads/multipart/initiate', async (req, ctx) => {
  const { handle, key } = await initiateUpload(ctx, req.body, true);
  return {
    uploadId: handle.uploadId,
    key,
    fileId: handle.fileId,
    partUrls: Array.from({ length: handle.partCount ?? 0 }, (_, i) => ({
      partNumber: i + 1,
      url: previewPutUrl(partBlobId(handle.uploadId, i + 1)),
    })),
    expiresAt: expiresAtIso(ctx),
  };
});

/** Part URLs again (the UI gets them all at initiate; this mirrors the backend's re-sign call). */
route('POST', '/files/uploads/multipart/sign', async (req, ctx) => {
  const handle = await requireHandle(ctx, req.body, 'multipart');
  await loadWritableVersion(ctx, handle.assetId, handle.versionId);
  const { partNumbers } = req.body as { partNumbers?: unknown };
  if (
    !Array.isArray(partNumbers) ||
    partNumbers.some((n) => !Number.isInteger(n) || n < 1 || n > 10_000)
  ) {
    throw invalid('partNumbers', 'partNumbers must be a list of integers between 1 and 10000.');
  }
  return (partNumbers as number[]).map((n) => ({
    partNumber: n,
    url: previewPutUrl(partBlobId(handle.uploadId, n)),
  }));
});

/**
 * Glues the uploaded parts into the file. Parts over 5 MB are metadata-only, so a big file ends
 * up as one metadata entry with the summed size; a file whose parts were all kept (a handful of
 * small ones, in tests) is concatenated into one stored blob. No parts at all is a 400, as in the
 * backend.
 */
route('POST', '/files/uploads/multipart/complete', async (req, ctx) => {
  const handle = await requireHandle(ctx, req.body, 'multipart');
  return once(handle.uploadId, async () => {
    if (handle.completedAt) return findCompletedFile(ctx, handle);
    const store = getBlobStore();
    const prefix = `${handle.uploadId}/part/`;
    const parts = (await store.list())
      .filter((m) => m.id.startsWith(prefix))
      .sort((a, b) => Number(a.id.slice(prefix.length)) - Number(b.id.slice(prefix.length)));
    if (parts.length === 0) {
      throw badRequest('No uploaded parts found for this upload: please upload the file again.', {
        code: 'file.upload_init_failed',
      });
    }
    const size = parts.reduce((sum, p) => sum + p.size, 0);
    const type = handle.contentType;
    const blobs = (await Promise.all(parts.map((p) => store.get(p.id)))).map(
      (e) => e?.blob ?? null,
    );
    const entry =
      size <= BLOB_STORE_MAX_BYTES && blobs.every((b): b is Blob => b !== null)
        ? await store.put(handle.uploadId, new Blob(blobs, { type }), { type })
        : await store.putMetadata(handle.uploadId, { size, type });
    await store.deleteByPrefix(prefix);
    return finishHandle(ctx, handle, entry);
  });
});

route('POST', '/files/uploads/multipart/abort', async (req, ctx) => {
  const handle = await requireHandle(ctx, req.body, 'multipart');
  await loadWritableVersion(ctx, handle.assetId, handle.versionId);
  if (!handle.completedAt) {
    const store = getBlobStore();
    await store.delete(handle.uploadId);
    await store.deleteByPrefix(`${handle.uploadId}/`);
    await dropHandle(ctx, handle.uploadId);
  }
  return undefined;
});

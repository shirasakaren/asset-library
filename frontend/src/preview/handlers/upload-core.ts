import type { AssetFileRecord, AssetRecord, AssetVersionRecord, KvRecord } from '../records';
import type { PreviewContext } from '../router/router';
import { badRequest, notFound } from '../router/errors';
import { PREVIEW_URL_SCHEME } from '@/lib/upload/put-with-progress';
import { getBlobStore } from '../uploads/blob-store';
import { revokeObjectUrl } from '../uploads/blob-url';
import { loadWritable } from './asset-write-core';
import { versionNotFound } from './version-files';

/**
 * Shared pieces of the simulated upload flow (see `uploads.ts`, `uploads-media.ts`).
 *
 * Flow in the static preview: `initiate` hands out an `uploadId` and a `preview://<uploadId>` PUT
 * URL and remembers the request as an `UploadHandle` (a `kv` record, so it survives a reload);
 * the browser "PUTs" the bytes into the blob store (`put-with-progress.ts`); `complete` turns the
 * stored bytes into an `AssetFile` row of the version. The real backend creates the (empty) row
 * already at `initiate`; here the row appears at `complete`, so an abandoned upload leaves nothing.
 */

/** Largest file the UI can describe (the S3 object limit). Anything above is "absurd" => 400. */
export const MAX_UPLOAD_BYTES = 5 * 1024 ** 4;
/** Handles (and the blobs of unfinished uploads) older than this are pruned on the next initiate. */
export const HANDLE_TTL_MS = 24 * 60 * 60 * 1000;
/** Lifetime reported as `expiresAt` of a simulated signed URL. */
export const URL_TTL_MS = 60 * 60 * 1000;

const MAX_PATH_LENGTH = 512;
const MAX_SEGMENT_LENGTH = 255;
const MAX_CONTENT_TYPE_LENGTH = 200;

export const previewPutUrl = (blobId: string): string => `${PREVIEW_URL_SCHEME}${blobId}`;
export const partBlobId = (uploadId: string, partNumber: number): string =>
  `${uploadId}/part/${partNumber}`;

export const expiresAtIso = (ctx: PreviewContext): string =>
  new Date(ctx.now().getTime() + URL_TTL_MS).toISOString();

export function newUploadId(ctx: PreviewContext): string {
  const uuid =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : ctx.newId('x').slice(2);
  return `up_${uuid}`;
}

export const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** 400 with the ProblemDetail field list the UI reads. */
export const invalid = (path: string, message: string, code = 'invalid') =>
  badRequest(message, { code: 'file.upload_init_failed', fields: [{ path, code, message }] });

export const uploadNotFound = (id: string) =>
  notFound(`Upload ${id} not found.`, { code: 'file.upload_not_found' });

/* -------------------------------------------------------------------------- *
 * Input validation
 * -------------------------------------------------------------------------- */

/**
 * Backend `normalizeRelativePath` plus the traversal hardening a browser path needs: backslashes
 * become `/`, leading slashes, empty and `.` segments are dropped, any `..` segment, control
 * characters, a drive letter as first segment and over-long names are rejected.
 */
export function normalizeRelativePath(raw: unknown): string {
  if (typeof raw !== 'string') throw invalid('relativePath', 'relativePath must be a string.');
  if (raw.length > MAX_PATH_LENGTH) {
    throw invalid('relativePath', `relativePath is longer than ${MAX_PATH_LENGTH} characters.`);
  }
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(raw)) {
    throw invalid('relativePath', 'relativePath contains control characters.');
  }
  const segments = raw
    .trim()
    .replace(/\\/g, '/')
    .split('/')
    .map((s) => s.trim())
    .filter((s) => s !== '' && s !== '.');
  if (segments.length === 0) throw invalid('relativePath', 'relativePath is empty.');
  if (segments.includes('..')) throw invalid('relativePath', 'relativePath cannot contain "..".');
  if (/^[a-zA-Z]:$/.test(segments[0]!)) {
    throw invalid('relativePath', 'relativePath must be relative (no drive letter).');
  }
  if (segments.some((s) => s.length > MAX_SEGMENT_LENGTH)) {
    throw invalid(
      'relativePath',
      `A path segment is longer than ${MAX_SEGMENT_LENGTH} characters.`,
    );
  }
  return segments.join('/');
}

export function parseBytes(raw: unknown, max = MAX_UPLOAD_BYTES): number {
  if (typeof raw !== 'number' || !Number.isSafeInteger(raw) || raw < 0) {
    throw invalid('bytes', 'bytes must be a non-negative integer.');
  }
  if (raw > max) throw invalid('bytes', 'bytes is larger than this demo accepts.', 'too_large');
  return raw;
}

export function parseString(raw: unknown, path: string, maxLength: number, allowEmpty = false) {
  if (typeof raw !== 'string' || (!allowEmpty && raw === '')) {
    throw invalid(path, `${path} must be a${allowEmpty ? '' : ' non-empty'} string.`);
  }
  if (raw.length > maxLength) {
    throw invalid(path, `${path} must be at most ${maxLength} characters.`);
  }
  return raw;
}

export interface InitiateInput {
  assetId: string;
  versionId: string;
  relativePath: string;
  contentType: string;
  bytes: number;
  partCount?: number;
}

/** `InitiateUploadDto` / `InitiateMultipartDto`. */
export function parseInitiate(body: unknown, multipart: boolean): InitiateInput {
  if (!isObject(body)) throw invalid('body', 'The request body must be a JSON object.');
  const out: InitiateInput = {
    assetId: parseString(body.assetId, 'assetId', 200),
    versionId: parseString(body.versionId, 'versionId', 200),
    relativePath: normalizeRelativePath(body.relativePath),
    contentType: parseString(body.contentType, 'contentType', MAX_CONTENT_TYPE_LENGTH, true),
    bytes: parseBytes(body.bytes),
  };
  if (multipart) {
    const n = body.partCount;
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > 10_000) {
      throw invalid('partCount', 'partCount must be an integer between 1 and 10000.');
    }
    out.partCount = n;
  }
  return out;
}

/* -------------------------------------------------------------------------- *
 * Upload handles (kv records)
 * -------------------------------------------------------------------------- */

export interface UploadHandle {
  uploadId: string;
  kind: 'file' | 'multipart';
  assetId: string;
  versionId: string;
  fileId: string;
  relativePath: string;
  contentType: string;
  /** Size announced at initiate. */
  bytes: number;
  partCount?: number;
  createdAt: string;
  /** Set by `complete`; a repeated complete returns the same file instead of adding another. */
  completedAt?: string;
}

const HANDLE_PREFIX = 'upload:';
const handleId = (uploadId: string) => `${HANDLE_PREFIX}${uploadId}`;

export async function saveHandle(ctx: PreviewContext, handle: UploadHandle): Promise<void> {
  await ctx.db.put<KvRecord>('kv', { id: handleId(handle.uploadId), value: handle });
}

export async function loadHandle(ctx: PreviewContext, uploadId: string): Promise<UploadHandle> {
  const rec = await ctx.db.get<KvRecord>('kv', handleId(uploadId));
  if (!rec) throw uploadNotFound(uploadId);
  return rec.value as UploadHandle;
}

export async function dropHandle(ctx: PreviewContext, uploadId: string): Promise<void> {
  await ctx.db.remove('kv', handleId(uploadId));
}

/** Drops expired handles and the blobs of uploads that never completed. */
export async function pruneHandles(ctx: PreviewContext): Promise<void> {
  const cutoff = ctx.now().getTime() - HANDLE_TTL_MS;
  const store = getBlobStore();
  for (const rec of await ctx.db.list<KvRecord>('kv')) {
    if (!rec.id.startsWith(HANDLE_PREFIX)) continue;
    const handle = rec.value as UploadHandle;
    if (Date.parse(handle.createdAt) >= cutoff) continue;
    if (!handle.completedAt) {
      await store.delete(handle.uploadId);
      await store.deleteByPrefix(`${handle.uploadId}/`);
    }
    await ctx.db.remove('kv', rec.id);
  }
}

/** The asset (writable by the persona) that holds the version a handle or request names. */
export async function loadWritableVersion(
  ctx: PreviewContext,
  assetId: string,
  versionId: string,
): Promise<{ asset: AssetRecord; version: AssetVersionRecord }> {
  const { asset } = await loadWritable(ctx, assetId);
  const version = asset.versions.find((v) => v.id === versionId);
  if (!version) throw versionNotFound(versionId);
  return { asset, version };
}

/* -------------------------------------------------------------------------- *
 * File <-> blob link
 * -------------------------------------------------------------------------- */

/** What an uploaded file stores in `meta.upload` (a seeded link file has `meta.content` instead). */
export interface UploadMeta {
  blobId: string;
  contentType: string;
  /** false: the bytes were over 5 MB and were not kept. */
  stored: boolean;
}

export function uploadMetaOf(file: Pick<AssetFileRecord, 'meta'>): UploadMeta | null {
  const meta = file.meta as unknown;
  if (!isObject(meta) || !isObject(meta.upload)) return null;
  const u = meta.upload;
  return typeof u.blobId === 'string'
    ? { blobId: u.blobId, contentType: String(u.contentType ?? ''), stored: u.stored === true }
    : null;
}

/** Removes the stored bytes and the cached download URL of a file that is gone. */
export async function discardFileBlob(file: AssetFileRecord): Promise<void> {
  revokeObjectUrl(`file:${file.id}`);
  const meta = uploadMetaOf(file);
  if (meta) {
    const store = getBlobStore();
    await store.delete(meta.blobId);
    await store.deleteByPrefix(`${meta.blobId}/`);
  }
}

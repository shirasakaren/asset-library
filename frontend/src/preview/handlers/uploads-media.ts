import type { AssetRecord, KvRecord } from '../records';
import { route, type PreviewContext } from '../router/router';
import { forbidden, notFound } from '../router/errors';
import { IMAGE_CAPS, type EditorMediaPurpose } from '@/lib/upload/image-caps';
import { BLOB_STORE_MAX_BYTES, getBlobStore } from '../uploads/blob-store';
import { blobRef, blobToDataUrl, placeholderImageDataUrl } from '../uploads/blob-url';
import { isoSeconds, loadWritable } from './asset-write-core';
import {
  expiresAtIso,
  imageTooLarge,
  invalid,
  isObject,
  newUploadId,
  parseBytes,
  parseString,
  previewPutUrl,
  uploadNotFound,
} from './upload-core';
import { serialized } from './write-queue';

/**
 * Thumbnail and editor-media uploads. The image bytes land in the blob store (PUT to
 * `preview://<id>`) and are then turned into a self-contained `data:` URL that is what the
 * records keep: nothing ephemeral is ever persisted (a `blob:` URL would be dead after a reload)
 * and no component has to know about the blob store. Because every list / detail read clones the
 * records, images are capped well below the 5 MB blob limit at `initiate` (`IMAGE_CAPS`): 1 MB
 * thumbnails, 1.5 MB preview-media display copies, 2 MB originals / embedded images. Video, audio
 * and 3D keep the 5 MB blob limit.
 *
 * Originals are stored separately (their own editor-media upload, kept as `originalUrl`); the
 * publish wizard skips the original and reuses the display copy when the file is over the original
 * cap, so a big photo still uploads (as its compressed display copy).
 */

const MAX_MEDIA_BYTES = BLOB_STORE_MAX_BYTES;

/** A thumbnail upload that was initiated but not completed is dropped after this long. */
const PENDING_THUMB_TTL_MS = 60 * 60 * 1000;
const PENDING_THUMB_PREFIX = 'thumb-pending:';

/**
 * Content types editor media (TipTap embeds, preview media) may have: image, video, audio and 3D
 * (`model/*`; the wizard's .glb/.fbx/.obj picker often reports no type, which the client turns
 * into `application/octet-stream`). Anything else is not editor media.
 */
const MEDIA_TYPE = /^(?:image|video|audio|model)\/.+|^application\/octet-stream$/;
const isMediaType = (type: string) => MEDIA_TYPE.test(type);

/** Drops the blob of a thumbnail upload and its pending record. */
async function dropPendingThumb(ctx: PreviewContext, blobId: string): Promise<void> {
  await getBlobStore().delete(blobId);
  await ctx.db.remove('kv', `${PENDING_THUMB_PREFIX}${blobId}`);
}

/**
 * Thumbnail bytes arrive in the blob store before `complete`; one that is never completed would
 * stay there. Each initiate leaves a `kv` record (survives reloads) and the next initiate or
 * complete drops the blobs and records older than an hour (`ctx.now()`). `keep` is the upload
 * being completed right now.
 */
async function prunePendingThumbs(ctx: PreviewContext, keep?: string): Promise<void> {
  const cutoff = ctx.now().getTime() - PENDING_THUMB_TTL_MS;
  const store = getBlobStore();
  for (const rec of await ctx.db.list<KvRecord>('kv')) {
    if (!rec.id.startsWith(PENDING_THUMB_PREFIX)) continue;
    const blobId = rec.id.slice(PENDING_THUMB_PREFIX.length);
    if (blobId === keep) continue;
    const createdAt = Date.parse(String((rec.value as { createdAt?: unknown }).createdAt));
    if (createdAt >= cutoff) continue;
    await store.delete(blobId);
    await ctx.db.remove('kv', rec.id);
  }
}

const tooBig = () => invalid('bytes', 'The demo keeps images and media up to 5 MB.', 'too_large');

/** The blob id that is the last segment of `<prefix>/<id>` (no further slashes allowed). */
function idAfter(key: string, prefix: string): string {
  const id = key.slice(prefix.length);
  if (!id || id.includes('/')) throw invalid('key', 'key is not a valid upload key.');
  return id;
}

/* -------------------------------------------------------------------------- *
 * Thumbnails
 * -------------------------------------------------------------------------- */

route('POST', '/files/thumbnails/initiate', async (req, ctx) => {
  if (!isObject(req.body)) throw invalid('body', 'The request body must be a JSON object.');
  const assetId = parseString(req.body.assetId, 'assetId', 200);
  const contentType = parseString(req.body.contentType, 'contentType', 100);
  const bytes = parseBytes(req.body.bytes, MAX_MEDIA_BYTES);
  if (!contentType.startsWith('image/')) {
    throw invalid('contentType', 'A thumbnail must be an image.');
  }
  if (bytes > IMAGE_CAPS.thumbnail) throw imageTooLarge('thumbnail', bytes, IMAGE_CAPS.thumbnail);
  const { asset } = await loadWritable(ctx, assetId);
  await prunePendingThumbs(ctx);
  const id = newUploadId(ctx);
  await ctx.db.put<KvRecord>('kv', {
    id: `${PENDING_THUMB_PREFIX}${id}`,
    value: { createdAt: ctx.now().toISOString() },
  });
  return {
    putUrl: previewPutUrl(id),
    key: `thumbs/${asset.id}/${id}`,
    expiresAt: expiresAtIso(ctx),
  };
});

/**
 * Makes the uploaded image the asset's thumbnail: `thumbnail = { key, url: <data URL> }` (the
 * checklist and every list read it from there). The blob is dropped afterwards, the data URL is
 * the copy. Calling it again for the same key is a no-op.
 */
route('POST', '/files/thumbnails/complete', (req, ctx) =>
  serialized(async () => {
    if (!isObject(req.body)) throw invalid('body', 'The request body must be a JSON object.');
    const assetId = parseString(req.body.assetId, 'assetId', 200);
    const key = parseString(req.body.key, 'key', 512);
    const { asset } = await loadWritable(ctx, assetId);
    const prefix = `thumbs/${asset.id}/`;
    if (!key.startsWith(prefix)) {
      throw forbidden("Thumbnail key is not in this asset's prefix.", { code: 'auth.forbidden' });
    }
    const id = idAfter(key, prefix);
    await prunePendingThumbs(ctx, id);
    if (asset.thumbnail?.key === key && asset.thumbnail.url) return undefined;

    const store = getBlobStore();
    const entry = await store.get(id);
    if (!entry) throw uploadNotFound(id);
    if (entry.size > IMAGE_CAPS.thumbnail) {
      await dropPendingThumb(ctx, id);
      throw imageTooLarge('thumbnail', entry.size, IMAGE_CAPS.thumbnail);
    }
    if (!entry.blob) throw invalid('key', 'The thumbnail was not kept (over 5 MB).', 'too_large');
    if (!entry.type.startsWith('image/')) throw invalid('key', 'The upload is not an image.');
    const url = await blobToDataUrl(entry.blob);
    await ctx.db.patch<AssetRecord>('assets', asset.id, {
      thumbnail: { key, url },
      updatedAt: isoSeconds(ctx),
    });
    await dropPendingThumb(ctx, id);
    ctx.emit({ type: 'assets.changed' });
    return undefined;
  }),
);

/* -------------------------------------------------------------------------- *
 * Editor media (TipTap embeds, preview media)
 * -------------------------------------------------------------------------- */

function parsePurpose(raw: unknown): EditorMediaPurpose | undefined {
  if (raw === undefined) return undefined;
  if (raw === 'display' || raw === 'original') return raw;
  throw invalid('purpose', 'purpose must be "display" or "original".');
}

/**
 * `purpose` is an optional hint of the publish wizard's gallery upload: a `display` copy has the
 * smaller cap. Without it an image is capped like an original (2 MB), which is also what embedded
 * editor images get.
 */
route('POST', '/files/editor-media/initiate', (req, ctx) => {
  if (!isObject(req.body)) throw invalid('body', 'The request body must be a JSON object.');
  const contentType = parseString(req.body.contentType, 'contentType', 100);
  if (!isMediaType(contentType)) {
    throw invalid('contentType', 'Only images, video, audio and 3D files can be uploaded here.');
  }
  const bytes = parseBytes(req.body.bytes, MAX_MEDIA_BYTES);
  const purpose = parsePurpose(req.body.purpose);
  if (contentType.startsWith('image/')) {
    const display = purpose === 'display';
    const cap = display ? IMAGE_CAPS.previewDisplay : IMAGE_CAPS.previewOriginal;
    if (bytes > cap) throw imageTooLarge(display ? 'preview image' : 'image', bytes, cap);
  } else if (bytes > MAX_MEDIA_BYTES) {
    throw tooBig();
  }
  const id = newUploadId(ctx);
  return {
    putUrl: previewPutUrl(id),
    key: `editor/${ctx.meId}/${id}`,
    // Stable reference only: the bytes do not exist yet. `refresh` returns the displayable URL.
    viewUrl: blobRef(id),
    expiresAt: expiresAtIso(ctx),
  };
});

/**
 * The URL to show an editor-media upload: a `data:` URL of the stored bytes, or a placeholder
 * picture when they are not there (cleared by "Reset demo data", never uploaded).
 */
route('POST', '/files/editor-media/refresh', async (req, ctx: PreviewContext) => {
  if (!isObject(req.body)) throw invalid('body', 'The request body must be a JSON object.');
  const key = parseString(req.body.key, 'key', 512);
  if (!key.startsWith('editor/'))
    throw invalid('key', 'Editor-media key must live under the editor/ prefix.');
  if (key.includes('..')) {
    throw forbidden('Editor-media key contains illegal segments.', { code: 'auth.forbidden' });
  }
  const id = key.slice(key.lastIndexOf('/') + 1);
  if (!id) throw notFound('Editor media not found.', { code: 'file.upload_not_found' });
  const entry = await getBlobStore().get(id);
  if (entry && !isMediaType(entry.type)) {
    throw invalid('contentType', 'Only images, video, audio and 3D files can be shown here.');
  }
  const viewUrl = entry?.blob
    ? await blobToDataUrl(entry.blob)
    : placeholderImageDataUrl('Image not available');
  return { viewUrl, expiresAt: expiresAtIso(ctx) };
});

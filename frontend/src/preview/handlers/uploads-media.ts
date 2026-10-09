import type { AssetRecord } from '../records';
import { route, type PreviewContext } from '../router/router';
import { forbidden, notFound } from '../router/errors';
import { BLOB_STORE_MAX_BYTES, getBlobStore } from '../uploads/blob-store';
import { blobRef, blobToDataUrl, placeholderImageDataUrl } from '../uploads/blob-url';
import { isoSeconds, loadWritable } from './asset-write-core';
import {
  expiresAtIso,
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
 * and no component has to know about the blob store. The 5 MB blob limit also bounds the size of
 * such a record, which is why these two flows refuse bigger files at `initiate`.
 */

const MAX_MEDIA_BYTES = BLOB_STORE_MAX_BYTES;

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
  if (bytes > MAX_MEDIA_BYTES) throw tooBig();
  const { asset } = await loadWritable(ctx, assetId);
  const id = newUploadId(ctx);
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
    if (asset.thumbnail?.key === key && asset.thumbnail.url) return undefined;

    const store = getBlobStore();
    const entry = await store.get(id);
    if (!entry) throw uploadNotFound(id);
    if (!entry.blob) throw invalid('key', 'The thumbnail was not kept (over 5 MB).', 'too_large');
    if (!entry.type.startsWith('image/')) throw invalid('key', 'The upload is not an image.');
    const url = await blobToDataUrl(entry.blob);
    await ctx.db.patch<AssetRecord>('assets', asset.id, {
      thumbnail: { key, url },
      updatedAt: isoSeconds(ctx),
    });
    await store.delete(id);
    ctx.emit({ type: 'assets.changed' });
    return undefined;
  }),
);

/* -------------------------------------------------------------------------- *
 * Editor media (TipTap embeds, preview media)
 * -------------------------------------------------------------------------- */

route('POST', '/files/editor-media/initiate', (req, ctx) => {
  if (!isObject(req.body)) throw invalid('body', 'The request body must be a JSON object.');
  parseString(req.body.contentType, 'contentType', 100);
  const bytes = parseBytes(req.body.bytes, MAX_MEDIA_BYTES);
  if (bytes > MAX_MEDIA_BYTES) throw tooBig();
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
  const viewUrl = entry?.blob
    ? await blobToDataUrl(entry.blob)
    : placeholderImageDataUrl('Image not available');
  return { viewUrl, expiresAt: expiresAtIso(ctx) };
});

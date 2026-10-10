/**
 * Turning stored blobs into things a browser can show or download.
 *
 * Persisted records NEVER hold an ephemeral `blob:` object URL (it dies with the page). Images
 * that end up in records (thumbnail, preview media, editor media) are stored as self-contained
 * `data:` URLs instead (they are at most 5 MB, the blob store's limit), so every existing
 * component keeps working untouched after a reload. `blob:` object URLs are only ever handed out
 * for downloads (`getUrl`), created on demand and cached per key here.
 *
 * `preview-blob:<id>` is the stable reference an `initiate` response may return before the bytes
 * exist; `POST /files/editor-media/refresh` turns it into the real `data:` URL.
 */

const REF_PREFIX = 'preview-blob:';

export const blobRef = (id: string): string => `${REF_PREFIX}${id}`;

export function parseBlobRef(value: string): string | null {
  return value.startsWith(REF_PREFIX) ? value.slice(REF_PREFIX.length) || null : null;
}

/** `data:<type>;base64,...` of a blob. */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the blob'));
    reader.readAsDataURL(blob);
  });
}

const objectUrls = new Map<string, string>();

/** The cached `blob:` URL of `key`, when one was already created (no blob needed). */
export const cachedObjectUrl = (key: string): string | null => objectUrls.get(key) ?? null;

/**
 * A `blob:` URL for `blob`, cached under `key` (the first blob given for a key wins). `null` when
 * the environment has no `URL.createObjectURL` (server rendering, jsdom without a stub).
 */
export function objectUrlFor(key: string, blob: Blob): string | null {
  const cached = objectUrls.get(key);
  if (cached) return cached;
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return null;
  const url = URL.createObjectURL(blob);
  objectUrls.set(key, url);
  return url;
}

export function revokeObjectUrl(key: string): void {
  const url = objectUrls.get(key);
  if (!url) return;
  objectUrls.delete(key);
  if (typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url);
}

export function clearObjectUrls(): void {
  for (const key of [...objectUrls.keys()]) revokeObjectUrl(key);
}

const escapeXml = (s: string) => s.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** A neutral "not available in the demo" picture, as a `data:` URL (for media too big to keep). */
export function placeholderImageDataUrl(label: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400">` +
    `<rect width="640" height="400" fill="#eceae4"/>` +
    `<text x="320" y="190" text-anchor="middle" font-family="sans-serif" font-size="22" fill="#5b616e">` +
    `${escapeXml(label)}</text>` +
    `<text x="320" y="224" text-anchor="middle" font-family="sans-serif" font-size="14" fill="#9aa1ad">` +
    `Demo limit: media over 5 MB is not kept</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

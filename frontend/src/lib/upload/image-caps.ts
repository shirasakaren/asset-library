/**
 * Size caps for the images the static preview keeps INSIDE records as `data:` URLs (thumbnail,
 * featured banner, preview media). A base64 data URL is about 4/3 of the file, and every list /
 * detail read clones the records, so the caps keep those payloads small. The upload handlers
 * enforce them at `initiate` (400 `too_large`); the publish wizard uses the same numbers to decide
 * whether to upload an original at all.
 */
export const IMAGE_CAPS = {
  /** Asset thumbnail (the UI compresses to <= 1280 px WebP first; GIFs are not compressed). */
  thumbnail: 1024 * 1024,
  /** Featured-slot banner image. */
  featuredBanner: 1024 * 1024,
  /** Category icon (also the backend limit). */
  categoryIcon: 256 * 1024,
  /** Preview-media display copy (the compressed variant the gallery shows). */
  previewDisplay: 1.5 * 1024 * 1024,
  /** Preview-media original (full-resolution click-through) and editor-embedded images. */
  previewOriginal: 2 * 1024 * 1024,
} as const;

export type ImageCapKind = keyof typeof IMAGE_CAPS;

/** What an editor-media upload is for; sent by the publish wizard's gallery upload. */
export type EditorMediaPurpose = 'display' | 'original';

const MB = 1024 * 1024;

/** "1 MB", "1.5 MB", "256 KB" for the limit in an error message. */
export function formatCap(bytes: number): string {
  if (bytes >= MB) return `${Number((bytes / MB).toFixed(1))} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

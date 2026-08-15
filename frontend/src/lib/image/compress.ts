'use client';

/**
 * Client-side image compression for thumbnails + preview images. Produces a
 * web-friendly variant (default ≤ 1600px on the long edge, WebP q0.82) so the
 * gallery loads fast. We keep the original file separately for the
 * full-resolution click-through; only the display copy is compressed.
 *
 * Falls back to the original file when the browser can't decode it or the
 * "compressed" output would be larger.
 */
export interface CompressOptions {
  maxDimension?: number;
  quality?: number;
  /** Output mime; webp falls back to jpeg if unsupported. */
  mime?: 'image/webp' | 'image/jpeg';
}

export async function compressImage(file: File, opts: CompressOptions = {}): Promise<File> {
  const maxDimension = opts.maxDimension ?? 1600;
  const quality = opts.quality ?? 0.82;
  const mime = opts.mime ?? 'image/webp';

  if (typeof document === 'undefined' || !file.type.startsWith('image/')) return file;
  // GIFs would lose animation if rasterized — never compress them.
  if (file.type === 'image/gif') return file;

  try {
    const bitmap = await createImageBitmap(file);
    const longEdge = Math.max(bitmap.width, bitmap.height);
    const scale = longEdge > maxDimension ? maxDimension / longEdge : 1;
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close?.();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), mime, quality),
    );
    // Some browsers can't encode webp from canvas — retry as jpeg.
    const finalBlob =
      blob ??
      (await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/jpeg', quality),
      ));
    if (!finalBlob || finalBlob.size >= file.size) return file;

    const ext = finalBlob.type === 'image/webp' ? 'webp' : 'jpg';
    const base = file.name.replace(/\.[^.]+$/, '');
    return new File([finalBlob], `${base}.display.${ext}`, { type: finalBlob.type });
  } catch {
    return file;
  }
}

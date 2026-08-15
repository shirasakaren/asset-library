import sharp from 'sharp';

export interface ImageMeta {
  width: number;
  height: number;
  hasAlpha: boolean;
  channels: number;
  format: string;
}

/** Reads dimensions + alpha from a 2D texture. Strips EXIF on write paths. */
export async function extractImage(filePath: string): Promise<ImageMeta | null> {
  try {
    const metadata = await sharp(filePath).metadata();
    if (!metadata.width || !metadata.height) return null;
    return {
      width: metadata.width,
      height: metadata.height,
      hasAlpha: !!metadata.hasAlpha,
      channels: metadata.channels ?? 0,
      format: metadata.format ?? 'unknown',
    };
  } catch {
    return null;
  }
}

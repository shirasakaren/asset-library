/**
 * One-off backfill: compress already-uploaded images so they load fast, while
 * preserving full-resolution originals for click-through.
 *
 *   - Preview-media IMAGE items: if they have no `displayKey` yet, download the
 *     original from the editor bucket, produce a compressed WebP variant at
 *     `<key>.display.webp`, upload it, and set `displayKey` on the item. The
 *     original key is left untouched (it's the full-res link). DB changes are
 *     limited to adding `displayKey` (+ defaulting `visibility`).
 *   - Thumbnails: overwrite the object IN PLACE with a compressed WebP at the
 *     SAME key (thumbnails are display-only; no full-res needed). No DB change.
 *     Idempotent — already-WebP, already-small objects are skipped.
 *
 * Safe to run repeatedly. Run inside the worker container (sharp is installed
 * there), e.g. from the monorepo root:
 *   docker compose exec worker \
 *     node -r ts-node/register/transpile-only scripts/compress-existing-images.ts
 * Pass --dry to preview without writing.
 */
/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client';
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import type { Readable } from 'node:stream';
import sharp from 'sharp';

const DRY = process.argv.includes('--dry');
const MAX_DIM = 1600;
const THUMB_MAX_DIM = 1280;
const WEBP_QUALITY = 82;
// Re-skip a thumbnail that is already a reasonably small webp.
const THUMB_SKIP_BYTES = 400 * 1024;

const prisma = new PrismaClient();

const endpoint = process.env.S3_ENDPOINT || undefined;
const s3 = new S3Client({
  region: process.env.S3_REGION ?? 'us-east-1',
  ...(endpoint ? { endpoint } : {}),
  forcePathStyle: ['1', 'true', 'yes', 'on'].includes(String(process.env.S3_FORCE_PATH_STYLE)),
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
  },
});

const THUMBS_BUCKET = process.env.S3_BUCKET_THUMBS ?? '';
const EDITOR_BUCKET = process.env.S3_BUCKET_EDITOR_MEDIA ?? '';

async function streamToBuffer(body: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of body) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function getObject(
  bucket: string,
  key: string,
): Promise<{ body: Buffer; contentType?: string } | null> {
  try {
    const out = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!out.Body) return null;
    return { body: await streamToBuffer(out.Body as Readable), contentType: out.ContentType };
  } catch {
    return null;
  }
}

async function head(
  bucket: string,
  key: string,
): Promise<{ bytes: number; contentType?: string } | null> {
  try {
    const out = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return { bytes: Number(out.ContentLength ?? 0), contentType: out.ContentType };
  } catch {
    return null;
  }
}

async function compress(buf: Buffer, maxDim: number): Promise<Buffer> {
  return sharp(buf, { failOn: 'none' })
    .rotate()
    .resize({ width: maxDim, height: maxDim, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();
}

function isImageItem(
  m: unknown,
): m is { id: string; kind: string; key: string; displayKey?: string; visibility?: string } {
  return (
    typeof m === 'object' &&
    m !== null &&
    typeof (m as { key?: unknown }).key === 'string' &&
    (m as { kind?: unknown }).kind === 'image'
  );
}

let thumbsDone = 0;
let thumbsSkipped = 0;
let previewsDone = 0;
let previewsSkipped = 0;

async function processThumbnail(key: string): Promise<void> {
  const meta = await head(THUMBS_BUCKET, key);
  if (!meta) {
    console.warn(`  thumb missing in S3: ${key}`);
    return;
  }
  if (meta.contentType === 'image/webp' && meta.bytes <= THUMB_SKIP_BYTES) {
    thumbsSkipped++;
    return;
  }
  const obj = await getObject(THUMBS_BUCKET, key);
  if (!obj) return;
  const out = await compress(obj.body, THUMB_MAX_DIM);
  if (out.length >= obj.body.length) {
    thumbsSkipped++;
    return;
  }

import type {
  AssetRecord,
  StorageAssetRecord,
  StorageBucketRecord,
  StorageRecord,
} from '../../records';
import type { PreviewContext } from '../../router/router';
import { dayFromNumber, dayNumber } from './common';

export const BUCKETS = ['source', 'derived', 'thumbs', 'featured', 'editor'] as const;

export interface AssetStorage {
  asset: AssetRecord;
  /** Seeded rollup of the asset (none for assets created in the browser). */
  seed: StorageAssetRecord | undefined;
  /** Bytes of files the visitor uploaded (everything except the seeded `.txt` link files). */
  extra: number;
}

export interface StorageModel {
  /** Day of the seeded snapshot ('' when there is none). */
  asOf: string;
  rows: AssetStorage[];
  buckets: StorageBucketRecord[];
  /** Seeded bytes of assets that are deleted now (they leave the `source` bucket). */
  deletedSeedBytes: number;
}

/** Bytes of the files a visitor uploaded: every file without the seeded `meta.content` link text. */
export function uploadedBytes(asset: AssetRecord): number {
  let total = 0;
  for (const v of asset.versions) {
    for (const f of v.files) {
      const content = (f.meta as { content?: unknown } | undefined)?.content;
      if (typeof content !== 'string') total += Number(f.bytes) || 0;
    }
  }
  return total;
}

export async function loadStorageModel(ctx: PreviewContext): Promise<StorageModel> {
  const [records, assets] = await Promise.all([
    ctx.db.list<StorageRecord>('storage'),
    ctx.db.list<AssetRecord>('assets'),
  ]);
  const seeds = new Map<string, StorageAssetRecord>();
  const buckets: StorageBucketRecord[] = [];
  let asOf = '';
  for (const r of records) {
    if (r.asOfDate > asOf) asOf = r.asOfDate;
    if (r.kind === 'asset') seeds.set(r.refId, r);
    else if (r.kind === 'bucket') buckets.push(r);
  }
  const live = new Set<string>();
  const rows: AssetStorage[] = [];
  for (const asset of assets) {
    if (asset.status === 'DELETED') continue;
    live.add(asset.id);
    rows.push({ asset, seed: seeds.get(asset.id), extra: uploadedBytes(asset) });
  }
  let deletedSeedBytes = 0;
  for (const [assetId, seed] of seeds) if (!live.has(assetId)) deletedSeedBytes += seed.bytes;
  return { asOf, rows, buckets, deletedSeedBytes };
}

/**
 * Bytes of one asset on `day`. Up to the snapshot day: the seeded spark (0 before its first value
 * and for assets without a rollup). After it: the snapshot value plus what the visitor uploaded.
 */
export function bytesOn(row: AssetStorage, day: string, asOf: string): number {
  if (day > asOf) return (row.seed?.bytes ?? 0) + row.extra;
  if (!row.seed) return 0;
  const idx = row.seed.spark.length - 1 - (dayNumber(asOf) - dayNumber(day));
  return idx >= 0 ? (row.seed.spark[idx] ?? 0) : 0;
}

/** `{ date, bytes }` for the `n` days ending on `end`, summed over `rows` (one row = an asset). */
export function sparkFor(
  rows: AssetStorage[],
  end: string,
  asOf: string,
  n = 30,
): { date: string; bytes: number }[] {
  const last = dayNumber(end);
  return Array.from({ length: n }, (_, i) => {
    const date = dayFromNumber(last - (n - 1 - i));
    return { date, bytes: rows.reduce((sum, r) => sum + bytesOn(r, date, asOf), 0) };
  });
}

/**
 * Dashboard storage: the seeded bucket rollups, with the `source` bucket corrected for what
 * changed since the snapshot (uploads added, deleted assets removed).
 */
export function bucketTotals(model: StorageModel): {
  totalBytes: number;
  byBucket: { bucket: string; bytes: number }[];
} {
  const seeded = new Map(model.buckets.map((b) => [b.bucket as string, b.bytes]));
  const extra = model.rows.reduce((sum, r) => sum + r.extra, 0);
  const byBucket = BUCKETS.map((bucket) => {
    const base = seeded.get(bucket) ?? 0;
    const bytes = bucket === 'source' ? Math.max(0, base - model.deletedSeedBytes + extra) : base;
    return { bucket: bucket as string, bytes };
  });
  return { totalBytes: byBucket.reduce((s, b) => s + b.bytes, 0), byBucket };
}

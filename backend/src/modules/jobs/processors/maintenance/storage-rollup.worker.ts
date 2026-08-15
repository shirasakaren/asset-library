import { Injectable, OnModuleInit } from '@nestjs/common';
import { ListObjectsV2Command, _Object as S3Object } from '@aws-sdk/client-s3';
import { Job } from 'bullmq';
import { AppConfigService } from '../../../../config/app-config.service';
import { PrismaService } from '../../../../infra/prisma/prisma.service';
import { S3Service } from '../../../../infra/s3/s3.service';
import { SentryService } from '../../../../infra/sentry/sentry.service';
import { JobsProducer } from '../../jobs.producer';
import { QUEUE } from '../../queue-names';
import { StorageRollupJob } from '../../contracts/storage';
import { JobWorkerBase } from '../../worker-base';

/**
 * Daily 01:30 — lists every configured S3 bucket and writes per-bucket+prefix,
 * per-user, and per-asset snapshots. Used by the admin dashboard's storage
 * block (Part 4 §3.1) and the storage drill-down endpoints.
 *
 * We pull bucket inventory live; for an installation big enough that ListObjectsV2
 * pagination becomes a hot spot, swap to S3 Inventory reports and ingest the
 * CSV (out of scope here).
 */
@Injectable()
export class StorageRollupWorker extends JobWorkerBase<StorageRollupJob> implements OnModuleInit {
  constructor(
    config: AppConfigService,
    sentry: SentryService,
    private readonly s3: S3Service,
    private readonly prisma: PrismaService,
    private readonly producer: JobsProducer,
  ) {
    super(QUEUE.STORAGE_ROLLUP, config, sentry);
  }

  override async onModuleInit(): Promise<void> {
    super.onModuleInit();
    await this.producer
      .queue(QUEUE.STORAGE_ROLLUP)
      .add(
        'cron',
        { triggeredAt: new Date().toISOString() },
        { jobId: 'storage-rollup-cron', repeat: { pattern: '30 1 * * *', tz: 'UTC' } },
      );
  }

  override async process(_job: Job<StorageRollupJob>): Promise<void> {
    const date = new Date(
      Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()),
    );

    // Map every asset id to its owner so the per-user rollup is one pass.
    const owners = new Map<string, string>();
    for (const a of await this.prisma.asset.findMany({ select: { id: true, ownerId: true } })) {
      owners.set(a.id, a.ownerId);
    }
    const perUser = new Map<string, { bytes: bigint; assetCount: number; ids: Set<string> }>();
    const perAsset = new Map<string, bigint>();

    const buckets: Array<{ role: 'assets' | 'thumbs' | 'editor'; segments: string[] }> = [
      { role: 'assets', segments: [''] },
      { role: 'thumbs', segments: [''] },
      { role: 'editor', segments: [''] },
    ];

    for (const { role } of buckets) {
      const bucketName = this.s3.bucketFor(role);
      const counters = new Map<string, { bytes: bigint; count: number }>(); // prefix → counts

      for await (const obj of this.walkBucket(role)) {
        const bytes = BigInt(obj.Size ?? 0);
        const prefix = this.normalizePrefix(role, obj.Key ?? '');
        const slot = counters.get(prefix) ?? { bytes: 0n, count: 0 };
        slot.bytes += bytes;
        slot.count += 1;
        counters.set(prefix, slot);

        if (role === 'assets') {
          const assetId = this.assetIdFromKey(obj.Key ?? '');
          if (assetId) {
            perAsset.set(assetId, (perAsset.get(assetId) ?? 0n) + bytes);
            const ownerId = owners.get(assetId);
            if (ownerId) {
              const entry = perUser.get(ownerId) ?? {
                bytes: 0n,
                assetCount: 0,
                ids: new Set<string>(),
              };
              entry.bytes += bytes;
              entry.ids.add(assetId);
              entry.assetCount = entry.ids.size;
              perUser.set(ownerId, entry);
            }
          }
        }
      }

      for (const [prefix, c] of counters) {
        await this.prisma.storageDaily.upsert({
          where: { date_bucket_prefix: { date, bucket: bucketName, prefix } },
          create: { date, bucket: bucketName, prefix, bytes: c.bytes, objectCount: c.count },
          update: { bytes: c.bytes, objectCount: c.count },
        });
      }
    }

    for (const [userId, c] of perUser) {
      await this.prisma.storageUserDaily.upsert({
        where: { date_userId: { date, userId } },
        create: { date, userId, bytes: c.bytes, assetCount: c.assetCount },
        update: { bytes: c.bytes, assetCount: c.assetCount },
      });
    }
    for (const [assetId, bytes] of perAsset) {
      await this.prisma.storageAssetDaily.upsert({
        where: { date_assetId: { date, assetId } },
        create: { date, assetId, bytes },
        update: { bytes },
      });
    }
    this.logger.log(
      `storage-rollup: ${perAsset.size} assets, ${perUser.size} users summarized for ${date.toISOString().slice(0, 10)}`,
    );
  }

  /**
   * Returns the high-level prefix bucket an object falls into. We don't store
   * every key — just the buckets a dashboard cares about:
   *   - `source`     — publisher uploads (assets/{id}/v.../<not __derived__>)
   *   - `derived`    — assets/{id}/v.../__derived__/* (Part 3 conversions)
   *   - `thumbs`     — publisher-supplied thumbnails
   *   - `featured`   — featured-slot banner uploads
   *   - `editor`     — TipTap inline media
   */
  private normalizePrefix(role: 'assets' | 'thumbs' | 'editor', key: string): string {
    if (role === 'assets') return key.includes('/__derived__/') ? 'derived' : 'source';
    if (role === 'thumbs') return key.startsWith('featured-banners/') ? 'featured' : 'thumbs';
    return 'editor';
  }

  private assetIdFromKey(key: string): string | null {
    // assets/{assetId}/v{semver}/...
    const m = key.match(/^assets\/([^/]+)\//);
    return m ? m[1] : null;
  }

  private async *walkBucket(role: 'assets' | 'thumbs' | 'editor'): AsyncGenerator<S3Object> {
    const bucketName = this.s3.bucketFor(role);
    let continuationToken: string | undefined;
    do {
      const list = await this.s3.client.send(
        new ListObjectsV2Command({ Bucket: bucketName, ContinuationToken: continuationToken }),
      );
      for (const obj of list.Contents ?? []) yield obj;
      continuationToken = list.IsTruncated ? list.NextContinuationToken : undefined;
    } while (continuationToken);
  }
}

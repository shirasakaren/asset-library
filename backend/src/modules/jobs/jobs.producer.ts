import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { AppConfigService } from '../../config/app-config.service';
import { RedisService } from '../../infra/redis/redis.service';
import {
  AnalyticsRollupJob,
  AnalyzeFileJob,
  AnalyzeVersionJob,
  ArchivePurgeJob,
  AuditPurgeJob,
  EditorMediaGcJob,
  GltfConvertJob,
  NotifyJob,
  SearchIndexBatchJob,
  SearchIndexJob,
  ThumbnailRenderJob,
  ThumbnailVariantsJob,
  WebhookDeliveryJob,
} from './contracts';
import { QUEUE, QueueName } from './queue-names';

/**
 * Producer-side facade for every BullMQ queue. Workers register against the
 * same names in `app.worker.module.ts`; this class is safe to use from API
 * mode (no processors started, just submits jobs).
 *
 * Job IDs are derived from the payload when uniqueness matters so retries
 * collapse instead of stacking (BullMQ rejects duplicate jobIds while one is
 * waiting/active).
 */
@Injectable()
export class JobsProducer implements OnModuleInit, OnModuleDestroy {
  private readonly queues = new Map<QueueName, Queue>();
  private readonly connectionUrl: string;

  constructor(redis: RedisService, config: AppConfigService) {
    this.connectionUrl = config.get('REDIS_URL');
    // Holding a reference forces module init ordering — Redis must be up
    // before BullMQ tries to dial it.
    void redis;
  }

  async onModuleInit(): Promise<void> {
    if (process.env.OPENAPI_EXPORT === '1') return;
    for (const name of Object.values(QUEUE)) this.queue(name);
    // The batch indexer runs on a fixed repeatable schedule.
    await this.scheduleSearchIndexBatch();
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all(Array.from(this.queues.values()).map((q) => q.close()));
  }

  queue(name: QueueName): Queue {
    let existing = this.queues.get(name);
    if (!existing) {
      existing = new Queue(name, {
        connection: { url: this.connectionUrl } as never,
        defaultJobOptions: {
          attempts: 5,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: { age: 24 * 60 * 60, count: 1000 },
          removeOnFail: { age: 7 * 24 * 60 * 60 },
        },
      });
      this.queues.set(name, existing);
    }
    return existing;
  }

  /** Used by Bull Board to enumerate queues. */
  listQueues(): Queue[] {
    return Array.from(this.queues.values());
  }

  // ─── Analyze ────────────────────────────────────────────────────────────

  enqueueAnalyzeFile(job: AnalyzeFileJob): Promise<unknown> {
    return this.queue(QUEUE.ANALYZE).add('analyze-file', job, {
      jobId: `${job.versionId}__${job.fileId}`,
    });
  }

  enqueueAnalyzeVersion(job: AnalyzeVersionJob): Promise<unknown> {
    return this.queue(QUEUE.ANALYZE_VERSION).add('rollup', job, {
      jobId: `${job.versionId}__${job.reason}`,
    });
  }

  // ─── Conversion / thumbnails ────────────────────────────────────────────

  enqueueGltfConvert(job: GltfConvertJob): Promise<unknown> {
    return this.queue(QUEUE.GLTF_CONVERT).add('convert', job, { jobId: job.fileId });
  }

  enqueueThumbnailVariants(job: ThumbnailVariantsJob): Promise<unknown> {
    // BullMQ rejects custom job IDs containing ':' (it's the Redis key
    // separator); sanitize any colons we might see in S3 keys.
    return this.queue(QUEUE.THUMBNAIL_VARIANTS).add('process', job, {
      jobId: job.sourceKey.replace(/:/g, '__'),
    });
  }

  enqueueThumbnailRender(job: ThumbnailRenderJob): Promise<unknown> {
    return this.queue(QUEUE.THUMBNAIL_RENDER).add('render', job, {
      jobId: `${job.versionId}__${job.glbKey}`,
    });
  }

  /**
   * Backwards-compat shim — Part 2 controllers may still call this. The new
   * name is `enqueueThumbnailVariants` (per the locked queue catalog).
   */
  enqueueThumbProcess(job: { assetId: string; thumbnailKey: string }): Promise<unknown> {
    return this.enqueueThumbnailVariants({ assetId: job.assetId, sourceKey: job.thumbnailKey });
  }

  // ─── Search ─────────────────────────────────────────────────────────────

  /**
   * Marks an asset dirty. The actual Meilisearch update is debounced — the
   * `search-index-batch` repeatable job picks up the Redis set every
   * SEARCH_INDEX_BATCH_INTERVAL_MS.
   */
  async enqueueSearchIndex(job: SearchIndexJob): Promise<void> {
    await this.queue(QUEUE.SEARCH_INDEX).add('mark-dirty', job, {
      jobId: `${job.assetId}__${job.reason}`,
    });
  }

  private async scheduleSearchIndexBatch(): Promise<void> {
    const queue = this.queue(QUEUE.SEARCH_INDEX_BATCH);
    await queue.add(
      'batch',
      { triggeredAt: new Date().toISOString() } satisfies SearchIndexBatchJob,
      {
        repeat: { every: 5000 },
        jobId: 'search-index-batch',
        removeOnComplete: { age: 60 },
        removeOnFail: { age: 60 * 60 },
      },
    );
  }

  // ─── Notify ─────────────────────────────────────────────────────────────

  enqueueNotify(job: NotifyJob): Promise<unknown> {
    return this.queue(QUEUE.NOTIFY).add('deliver', job);
  }

  // ─── Webhook ────────────────────────────────────────────────────────────

  enqueueWebhook(job: WebhookDeliveryJob): Promise<unknown> {
    return this.queue(QUEUE.WEBHOOK).add('deliver', job);
  }

  // ─── Crons ──────────────────────────────────────────────────────────────

  enqueueArchivePurge(job: ArchivePurgeJob): Promise<unknown> {
    return this.queue(QUEUE.ARCHIVE_PURGE).add('purge', job);
  }

  enqueueAuditPurge(job: AuditPurgeJob): Promise<unknown> {
    return this.queue(QUEUE.AUDIT_PURGE).add('purge', job);
  }

  enqueueEditorMediaGc(job: EditorMediaGcJob): Promise<unknown> {
    return this.queue(QUEUE.EDITOR_MEDIA_GC).add('gc', job);
  }

  enqueueAnalyticsRollup(job: AnalyticsRollupJob): Promise<unknown> {
    return this.queue(QUEUE.ANALYTICS_ROLLUP).add('rollup', job);
  }

  enqueueStorageRollup(job: { triggeredAt: string }): Promise<unknown> {
    return this.queue(QUEUE.STORAGE_ROLLUP).add('rollup', job);
  }
}

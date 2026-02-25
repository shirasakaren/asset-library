import { Injectable, OnModuleInit } from '@nestjs/common';
import { DeleteObjectsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { Job } from 'bullmq';
import { AppConfigService } from '../../../../config/app-config.service';
import {
  MEILI_INDEX_ASSETS,
  MeilisearchService,
} from '../../../../infra/meilisearch/meilisearch.service';
import { PrismaService } from '../../../../infra/prisma/prisma.service';
import { S3Service } from '../../../../infra/s3/s3.service';
import { SentryService } from '../../../../infra/sentry/sentry.service';
import { ArchivePurgeJob } from '../../contracts';
import { JobsProducer } from '../../jobs.producer';
import { QUEUE } from '../../queue-names';
import { JobWorkerBase } from '../../worker-base';

/**
 * Daily 03:00 cron. Deletes S3 objects + Postgres rows + Meilisearch entries
 * for any Asset that has been ARCHIVED or DELETED for longer than
 * ARCHIVE_PURGE_DAYS. Each asset is purged in its own transaction so a
 * partial failure on one doesn't strand the rest.
 */
@Injectable()
export class ArchivePurgeWorker extends JobWorkerBase<ArchivePurgeJob> implements OnModuleInit {
  constructor(
    config: AppConfigService,
    sentry: SentryService,
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly meili: MeilisearchService,
    private readonly producer: JobsProducer,
  ) {
    super(QUEUE.ARCHIVE_PURGE, config, sentry);
  }

  override async onModuleInit(): Promise<void> {
    super.onModuleInit();
    await this.scheduleDaily();
  }

  private async scheduleDaily(): Promise<void> {
    const queue = this.producer.queue(QUEUE.ARCHIVE_PURGE);
    await queue.add(
      'cron',
      { triggeredAt: new Date().toISOString() },
      {
        jobId: 'archive-purge-cron',
        repeat: { pattern: '0 3 * * *', tz: 'UTC' },
        removeOnComplete: { age: 60 * 60 * 24 * 7 },
      },
    );
  }

  override async process(_job: Job<ArchivePurgeJob>): Promise<void> {
    const cutoff = new Date(Date.now() - this.config.get('ARCHIVE_PURGE_DAYS') * 86_400_000);
    const candidates = await this.prisma.asset.findMany({
      where: {
        status: { in: ['ARCHIVED', 'DELETED'] },
        archivedAt: { lte: cutoff, not: null },
      },
      select: { id: true, slug: true, thumbnailKey: true, status: true },
    });
    this.logger.log(
      `archive-purge: ${candidates.length} asset(s) older than ${cutoff.toISOString()}`,
    );

    for (const asset of candidates) {
      try {
        await this.purgeOne(asset);
      } catch (err) {
        this.logger.error(`archive-purge: ${asset.id} failed: ${(err as Error).message}`);
        this.sentry.captureException(err, { assetId: asset.id });
      }
    }
  }

  private async purgeOne(asset: {
    id: string;
    slug: string;

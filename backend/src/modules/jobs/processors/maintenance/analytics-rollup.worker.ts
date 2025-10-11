import { Injectable, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Job } from 'bullmq';
import { AppConfigService } from '../../../../config/app-config.service';
import { PrismaService } from '../../../../infra/prisma/prisma.service';
import { SentryService } from '../../../../infra/sentry/sentry.service';
import { AnalyticsRollupJob } from '../../contracts';
import { JobsProducer } from '../../jobs.producer';
import { QUEUE } from '../../queue-names';
import { JobWorkerBase } from '../../worker-base';

/**
 * Daily 02:00 — aggregates yesterday's `Download` rows into `DownloadDaily`,
 * upserts `AssetStats`, and trims raw `Download` rows older than
 * DOWNLOAD_RAW_RETENTION_DAYS.
 */
@Injectable()
export class AnalyticsRollupWorker
  extends JobWorkerBase<AnalyticsRollupJob>
  implements OnModuleInit
{
  constructor(
    config: AppConfigService,
    sentry: SentryService,
    private readonly prisma: PrismaService,
    private readonly producer: JobsProducer,
  ) {
    super(QUEUE.ANALYTICS_ROLLUP, config, sentry);
  }

  override async onModuleInit(): Promise<void> {
    super.onModuleInit();
    await this.producer
      .queue(QUEUE.ANALYTICS_ROLLUP)
      .add(
        'cron',
        { triggeredAt: new Date().toISOString() },
        { jobId: 'analytics-rollup-cron', repeat: { pattern: '0 2 * * *', tz: 'UTC' } },
      );
  }

  override async process(_job: Job<AnalyticsRollupJob>): Promise<void> {
    const now = new Date();
    const yesterdayUtc = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1),
    );
    const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    // Per-(asset, date) aggregate — raw SQL because Prisma's groupBy can't
    // produce nested JSON aggregates.
    const dailyRows = await this.prisma
      .$queryRaw<DailyRow[]>(
        Prisma.sql`
      SELECT "assetId",
             COUNT(*)::int AS count,
             COUNT(DISTINCT "userId")::int AS "uniqueUsers",
             jsonb_object_agg(country, country_count) FILTER (WHERE country IS NOT NULL) AS "byCountry",
             jsonb_object_agg(source, source_count) AS "bySource"
      FROM (
        SELECT "assetId", "userId", "country",
               "source",
               COUNT(*) OVER (PARTITION BY "assetId", "country") AS country_count,
               COUNT(*) OVER (PARTITION BY "assetId", "source") AS source_count
        FROM downloads
        WHERE "createdAt" >= ${yesterdayUtc} AND "createdAt" < ${todayUtc}
      ) sub
      GROUP BY "assetId"
    `,
      )
      .catch(() => [] as DailyRow[]);

    for (const row of dailyRows) {
      await this.prisma.downloadDaily.upsert({
        where: { assetId_date: { assetId: row.assetId, date: yesterdayUtc } },
        create: {
          assetId: row.assetId,
          date: yesterdayUtc,
          count: row.count,
          uniqueUsers: row.uniqueUsers,
          byCountry: (row.byCountry ?? {}) as unknown as Prisma.InputJsonValue,
          bySource: (row.bySource ?? {}) as unknown as Prisma.InputJsonValue,
        },
        update: {
          count: row.count,
          uniqueUsers: row.uniqueUsers,
          byCountry: (row.byCountry ?? {}) as unknown as Prisma.InputJsonValue,
          bySource: (row.bySource ?? {}) as unknown as Prisma.InputJsonValue,
        },
      });
    }

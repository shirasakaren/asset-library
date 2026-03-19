import { Injectable, OnModuleInit } from '@nestjs/common';
import { Job } from 'bullmq';
import { AppConfigService } from '../../../../config/app-config.service';
import { PrismaService } from '../../../../infra/prisma/prisma.service';
import { SentryService } from '../../../../infra/sentry/sentry.service';
import { AuditPurgeJob } from '../../contracts';
import { JobsProducer } from '../../jobs.producer';
import { QUEUE } from '../../queue-names';
import { JobWorkerBase } from '../../worker-base';

/** Daily 04:00 — prunes AuditLog rows past AUDIT_LOG_RETENTION_DAYS. */
@Injectable()
export class AuditPurgeWorker extends JobWorkerBase<AuditPurgeJob> implements OnModuleInit {
  constructor(
    config: AppConfigService,
    sentry: SentryService,
    private readonly prisma: PrismaService,
    private readonly producer: JobsProducer,
  ) {
    super(QUEUE.AUDIT_PURGE, config, sentry);
  }

  override async onModuleInit(): Promise<void> {
    super.onModuleInit();
    await this.producer
      .queue(QUEUE.AUDIT_PURGE)
      .add(
        'cron',
        { triggeredAt: new Date().toISOString() },
        { jobId: 'audit-purge-cron', repeat: { pattern: '0 4 * * *', tz: 'UTC' } },
      );
  }

  override async process(_job: Job<AuditPurgeJob>): Promise<void> {
    const cutoff = new Date(Date.now() - this.config.get('AUDIT_LOG_RETENTION_DAYS') * 86_400_000);
    const result = await this.prisma.auditLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
    this.logger.log(`audit-purge: removed ${result.count} rows older than ${cutoff.toISOString()}`);
  }
}

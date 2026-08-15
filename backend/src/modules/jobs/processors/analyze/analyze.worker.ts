import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Job } from 'bullmq';
import { AppConfigService } from '../../../../config/app-config.service';
import { PrismaService } from '../../../../infra/prisma/prisma.service';
import { RedisService } from '../../../../infra/redis/redis.service';
import { SentryService } from '../../../../infra/sentry/sentry.service';
import { AnalyzeFileJob } from '../../contracts';
import { JobsProducer } from '../../jobs.producer';
import { QUEUE } from '../../queue-names';
import { JobWorkerBase } from '../../worker-base';
import { AnalyzeService } from './analyze.service';

const FAN_IN_KEY = (versionId: string) => `analyze:version:${versionId}:remaining`;

/**
 * Per-file analyzer. Idempotent — re-running for the same `(versionId, fileId)`
 * replaces meta + dependency rows inside a transaction. After persisting the
 * file's data we decrement the fan-in counter; when it hits zero the version
 * rollup job runs.
 */
@Injectable()
export class AnalyzeWorker extends JobWorkerBase<AnalyzeFileJob> {
  constructor(
    config: AppConfigService,
    sentry: SentryService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly analyze: AnalyzeService,
    private readonly producer: JobsProducer,
  ) {
    super(QUEUE.ANALYZE, config, sentry);
  }

  async process(job: Job<AnalyzeFileJob>): Promise<void> {
    const { versionId, fileId } = job.data;
    const file = await this.prisma.assetFile.findUnique({ where: { id: fileId } });
    if (!file || file.versionId !== versionId) {
      this.logger.warn(`Analyze: file ${fileId} not found or moved — dropping job.`);
      return;
    }

    let analyzed;
    try {
      analyzed = await this.analyze.analyzeFile({
        jobId: job.id ?? `job-${Date.now()}`,
        s3Key: file.s3Key,
        relativePath: file.relativePath,
        bytes: Number(file.bytes),
        mimeType: file.mimeType,
      });
    } catch (err) {
      // A single-file failure shouldn't block the rollup. Persist the failure
      // hint into meta and let downstream consumers see kind=OTHER.
      await this.prisma.assetFile.update({
        where: { id: fileId },
        data: {
          meta: {
            analyzerError: (err as Error).message,
          } as unknown as Prisma.InputJsonValue,
        },
      });
      await this.decrementAndMaybeRollup(versionId);
      throw err;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.assetFile.update({
        where: { id: fileId },
        data: {
          kind: analyzed.kind,
          mimeType: analyzed.mimeType,
          bytes: BigInt(analyzed.bytes),
          meta: analyzed.meta as unknown as Prisma.InputJsonValue,
        },
      });
      if (analyzed.dependencies?.length) {
        // Replace previous dependency rows so reruns don't duplicate.
        await tx.assetDependency.deleteMany({
          where: {
            versionId,
            source: { in: Array.from(new Set(analyzed.dependencies.map((d) => d.source))) },
          },
        });
        await tx.assetDependency.createMany({
          data: analyzed.dependencies.map((d) => ({
            versionId,
            name: d.name,
            version: d.version ?? null,
            source: d.source,
          })),
        });
      }
      if (analyzed.requiresEmptyProject) {
        const version = await tx.assetVersion.findUnique({
          where: { id: versionId },
          select: { assetId: true },
        });
        if (version) {
          await tx.asset.update({
            where: { id: version.assetId },
            data: { requiresEmptyProject: true },
          });
        }
      }
    });

    await this.decrementAndMaybeRollup(versionId);
  }

  /**
   * The upload-complete handler primed the counter with the number of files
   * to expect. Each successful (or failed) file analysis decrements it; when
   * the counter hits zero the rollup worker runs.
   */
  private async decrementAndMaybeRollup(versionId: string): Promise<void> {
    const key = FAN_IN_KEY(versionId);
    const remaining = await this.redis.client.decr(key);
    if (remaining <= 0) {
      await this.redis.client.del(key);
      await this.producer.enqueueAnalyzeVersion({ versionId, reason: 'fan-in' });
    }
  }
}

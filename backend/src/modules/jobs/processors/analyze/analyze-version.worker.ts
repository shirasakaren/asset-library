import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { AnalysisStatus, AssetFileKind, NotificationType, Prisma } from '@prisma/client';
import { Job } from 'bullmq';
import { Model } from 'mongoose';
import { AppConfigService } from '../../../../config/app-config.service';
import { PrismaService } from '../../../../infra/prisma/prisma.service';
import { SentryService } from '../../../../infra/sentry/sentry.service';
import { AnalyzeVersionJob } from '../../contracts';
import { JobsProducer } from '../../jobs.producer';
import { QUEUE } from '../../queue-names';
import { JobWorkerBase } from '../../worker-base';
import { buildManifest } from './manifest';
import { AnalysisReport } from './analysis-report.schema';

/**
 * Fan-in rollup. Reads every analyzed AssetFile for the version, builds the
 * manifest tree, writes the queryable slice to Postgres and the full dump to
 * Mongo, then triggers conversion + search reindex.
 */
@Injectable()
export class AnalyzeVersionWorker extends JobWorkerBase<AnalyzeVersionJob> {
  constructor(
    config: AppConfigService,
    sentry: SentryService,
    private readonly prisma: PrismaService,
    private readonly producer: JobsProducer,
    @InjectModel(AnalysisReport.name) private readonly reports: Model<AnalysisReport>,
  ) {
    super(QUEUE.ANALYZE_VERSION, config, sentry);
  }

  async process(job: Job<AnalyzeVersionJob>): Promise<void> {
    const { versionId } = job.data;
    const version = await this.prisma.assetVersion.findUnique({
      where: { id: versionId },
      include: { files: true, asset: true },
    });
    if (!version) {
      this.logger.warn(`AnalyzeVersion: version ${versionId} missing — dropping job.`);
      return;
    }

    const manifest = buildManifest(version.files);
    const totalBytes = version.files.reduce((sum, f) => sum + Number(f.bytes), 0);
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.assetVersion.update({
          where: { id: versionId },
          data: {
            manifest: manifest as unknown as Prisma.InputJsonValue,
            bytesTotal: BigInt(totalBytes),
            fileCount: version.files.length,
            analysisStatus: AnalysisStatus.READY,
          },
        });
      });
    } catch (err) {
      await this.handleFailure(
        versionId,
        version.asset.ownerId,
        version.asset.title,
        version.asset.id,
        version.asset.slug,
        err as Error,
      );
      throw err;
    }

    // Mirror the raw dump into Mongo for debugging / future reanalysis.
    await this.reports.findOneAndUpdate(
      { versionId },
      {
        versionId,
        manifest,
        perFile: Object.fromEntries(version.files.map((f) => [f.id, f.meta ?? {}])),
        builtAt: new Date(),
      },
      { upsert: true, new: true },
    );

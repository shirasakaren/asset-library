import { Injectable } from '@nestjs/common';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { Job } from 'bullmq';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { AppConfigService } from '../../../../config/app-config.service';
import { PrismaService } from '../../../../infra/prisma/prisma.service';
import { S3Service } from '../../../../infra/s3/s3.service';
import { SentryService } from '../../../../infra/sentry/sentry.service';
import { GltfConvertJob } from '../../contracts';
import { JobsProducer } from '../../jobs.producer';
import { QUEUE } from '../../queue-names';
import { JobWorkerBase } from '../../worker-base';
import { openScratch } from '../analyze/scratch';
import { runSubprocess } from '../analyze/subprocess';

const MAX_PRE_COMPRESSION_BYTES = 200 * 1024 * 1024;

/**
 * Converts FBX/OBJ/BLEND/GLTF → GLB into the derived prefix:
 *   assets/{assetId}/v{semver}/__derived__/web-viewer/<originalPath>.glb
 *
 * Always reads the original from S3, never mutates it. After GLB export we
 * run gltfpack with Draco compression (and KTX2 if FEATURE_GLTFPACK_KTX2 is
 * set + the binary supports it) to keep the web viewer's payload small.
 */
@Injectable()
export class GltfConvertWorker extends JobWorkerBase<GltfConvertJob> {
  constructor(
    config: AppConfigService,
    sentry: SentryService,
    private readonly s3: S3Service,
    private readonly prisma: PrismaService,
    private readonly producer: JobsProducer,
  ) {
    super(QUEUE.GLTF_CONVERT, config, sentry);
  }

  async process(job: Job<GltfConvertJob>): Promise<void> {
    const { versionId, fileId, sourceKey, sourceKind } = job.data;
    const version = await this.prisma.assetVersion.findUnique({
      where: { id: versionId },
      include: { asset: true },
    });
    if (!version) return;
    const file = await this.prisma.assetFile.findUnique({ where: { id: fileId } });
    if (!file) return;

    if (Number(file.bytes) > MAX_PRE_COMPRESSION_BYTES) {
      await this.markSkipped(fileId, 'too_large');
      return;
    }

    const timeoutMs = this.config.get('GLTF_CONVERT_TIMEOUT_SEC') * 1000;
    const scratch = await openScratch(
      this.s3,
      'assets',
      sourceKey,
      job.id ?? `job-${Date.now()}`,
      this.config.get('WORKER_SCRATCH_DIR'),
    );
    const outGlbRaw = join(scratch.dir, 'out.glb');
    const outGlbPacked = join(scratch.dir, 'out.packed.glb');
    try {
      await mkdir(scratch.dir, { recursive: true });
      await this.runBlenderConvert(scratch.filePath, outGlbRaw, sourceKind, timeoutMs);
      await this.runGltfpack(outGlbRaw, outGlbPacked, timeoutMs);
      const finalPath = (await this.exists(outGlbPacked)) ? outGlbPacked : outGlbRaw;
      const derivedKey = this.derivedKeyFor(version.s3Prefix, file.relativePath);
      const body = await readFile(finalPath);
      await this.s3.client.send(
        new PutObjectCommand({
          Bucket: this.s3.bucketFor('assets'),
          Key: derivedKey,
          Body: body,
          ContentType: 'model/gltf-binary',
        }),
      );
      const existingMeta = (file.meta as Record<string, unknown> | null) ?? {};
      await this.prisma.assetFile.update({
        where: { id: fileId },
        data: {
          meta: {
            ...existingMeta,
            webViewerGlb: { key: derivedKey, bytes: body.length },
          } as never,
        },
      });
      // Picking the "biggest" GLB for the auto-thumbnail render happens once
      // per version; we enqueue every GLB we produce and let the renderer
      // pick. (BullMQ collapses duplicate jobIds — see jobs.producer.)
      await this.producer.enqueueThumbnailRender({ versionId, glbKey: derivedKey });
    } catch (err) {
      this.logger.warn(`GLTF convert failed for ${fileId}: ${(err as Error).message}`);
      await this.markSkipped(fileId, (err as Error).message);
      throw err;
    } finally {
      await scratch.cleanup();
      await rm(outGlbRaw, { force: true });
      await rm(outGlbPacked, { force: true });
    }
  }

  private async runBlenderConvert(
    input: string,
    output: string,
    kind: GltfConvertJob['sourceKind'],
    timeoutMs: number,
  ): Promise<void> {
    const script = join(process.cwd(), 'scripts', 'blender', 'fbx_to_glb.py');
    if (kind === 'GLTF') {
      // Skip Blender for separate-file glTF — gltf-pipeline handles bundling.
      await runSubprocess(this.config.get('GLTF_PIPELINE_BIN'), ['-i', input, '-o', output, '-b'], {
        timeoutMs,
      });
      return;
    }
    const res = await runSubprocess(
      this.config.get('BLENDER_BIN'),
      ['-b', '-P', script, '--', input, output],
      { timeoutMs },
    );
    if (res.exitCode !== 0) {
      throw new Error(`Blender exit ${res.exitCode}: ${res.stderr.slice(-512)}`);
    }
  }

  private async runGltfpack(input: string, output: string, timeoutMs: number): Promise<void> {
    const args = ['-i', input, '-o', output, '-cc'];
    if (this.config.get('GLTFPACK_KTX2')) args.push('-tc');
    try {
      const res = await runSubprocess(this.config.get('GLTFPACK_BIN'), args, { timeoutMs });
      if (res.exitCode !== 0) {
        this.logger.warn(`gltfpack non-zero (${res.exitCode}); using unpacked GLB`);
      }
    } catch (err) {
      this.logger.warn(`gltfpack unavailable: ${(err as Error).message}`);
    }
  }

  private derivedKeyFor(s3Prefix: string, relativePath: string): string {
    return `${s3Prefix}__derived__/web-viewer/${relativePath}.glb`;
  }

  private async markSkipped(fileId: string, reason: string): Promise<void> {
    const file = await this.prisma.assetFile.findUnique({ where: { id: fileId } });
    if (!file) return;
    const existingMeta = (file.meta as Record<string, unknown> | null) ?? {};
    await this.prisma.assetFile.update({
      where: { id: fileId },
      data: {
        meta: { ...existingMeta, webViewerSkipped: reason } as never,
      },
    });
  }

  private async exists(path: string): Promise<boolean> {
    try {
      await readFile(path);
      return true;
    } catch {
      return false;
    }
  }
}

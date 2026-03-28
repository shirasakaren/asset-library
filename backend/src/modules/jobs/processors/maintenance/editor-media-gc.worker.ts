import { Injectable, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Job } from 'bullmq';
import { AppConfigService } from '../../../../config/app-config.service';
import { PrismaService } from '../../../../infra/prisma/prisma.service';
import { S3Service } from '../../../../infra/s3/s3.service';
import { SentryService } from '../../../../infra/sentry/sentry.service';
import { EditorMediaGcJob } from '../../contracts';
import { JobsProducer } from '../../jobs.producer';
import { QUEUE } from '../../queue-names';
import { JobWorkerBase } from '../../worker-base';

const SEVEN_DAYS_MS = 7 * 86_400_000;

/**
 * Daily 04:30 — walks every AssetTranslation.longDescription TipTap doc to
 * compute the set of referenced editor-media keys. Any EditorMediaUpload row
 * that's still unreferenced AND older than 7 days is removed from S3 and the
 * row is dropped.
 */
@Injectable()
export class EditorMediaGcWorker extends JobWorkerBase<EditorMediaGcJob> implements OnModuleInit {
  constructor(
    config: AppConfigService,
    sentry: SentryService,
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly producer: JobsProducer,
  ) {
    super(QUEUE.EDITOR_MEDIA_GC, config, sentry);
  }

  override async onModuleInit(): Promise<void> {
    super.onModuleInit();
    await this.producer
      .queue(QUEUE.EDITOR_MEDIA_GC)
      .add(
        'cron',
        { triggeredAt: new Date().toISOString() },
        { jobId: 'editor-media-gc-cron', repeat: { pattern: '30 4 * * *', tz: 'UTC' } },
      );
  }

  override async process(_job: Job<EditorMediaGcJob>): Promise<void> {
    const referenced = await this.collectReferencedKeys();
    await this.prisma.editorMediaUpload.updateMany({
      where: { key: { in: Array.from(referenced) } },
      data: { referenced: true },
    });

    const cutoff = new Date(Date.now() - SEVEN_DAYS_MS);
    const orphans = await this.prisma.editorMediaUpload.findMany({
      where: { referenced: false, createdAt: { lt: cutoff } },
      take: 1000,
    });

    let removed = 0;
    for (const orphan of orphans) {
      if (referenced.has(orphan.key)) continue;
      try {
        await this.s3.deleteObject('editor', orphan.key);
        await this.prisma.editorMediaUpload.delete({ where: { id: orphan.id } });
        removed += 1;
      } catch (err) {
        this.logger.warn(
          `editor-media-gc: failed to delete ${orphan.key}: ${(err as Error).message}`,
        );
      }
    }
    this.logger.log(`editor-media-gc: removed ${removed} orphan(s)`);
  }

  /**
   * Walks the TipTap document JSON for every AssetTranslation, harvesting
   * image/video/embed src attributes that point at the editor bucket.
   */
  private async collectReferencedKeys(): Promise<Set<string>> {
    const referenced = new Set<string>();
    const editorBucket = this.s3.bucketFor('editor');
    const translations = await this.prisma.assetTranslation.findMany({
      select: { longDescription: true },
    });
    for (const t of translations) {
      walkTipTap(t.longDescription as Prisma.JsonValue, (key) => referenced.add(key), editorBucket);
    }
    return referenced;
  }
}

function walkTipTap(
  node: Prisma.JsonValue,
  collect: (key: string) => void,
  editorBucket: string,
): void {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const child of node) walkTipTap(child, collect, editorBucket);
    return;
  }
  if (typeof node !== 'object') return;
  const obj = node as Record<string, Prisma.JsonValue>;
  const attrs = obj.attrs as Record<string, unknown> | undefined;
  if (attrs) {
    for (const field of ['src', 'href']) {
      const value = attrs[field];
      if (typeof value === 'string') {
        const key = extractEditorKey(value, editorBucket);
        if (key) collect(key);
      }
    }
  }
  if (obj.content) walkTipTap(obj.content, collect, editorBucket);
  if (obj.marks) walkTipTap(obj.marks as Prisma.JsonValue, collect, editorBucket);
}

/**
 * Returns the key path if the URL points at our editor bucket; otherwise
 * null. Handles both path-style (MinIO) and virtual-hosted (AWS) endpoints.
 */
function extractEditorKey(url: string, editorBucket: string): string | null {
  try {
    const parsed = new URL(url);
    // Virtual-hosted: <bucket>.s3.<region>.amazonaws.com/<key>
    if (parsed.hostname.startsWith(`${editorBucket}.`)) {
      return decodeURIComponent(parsed.pathname.replace(/^\//, ''));
    }
    // Path-style: /<bucket>/<key>
    if (parsed.pathname.startsWith(`/${editorBucket}/`)) {
      return decodeURIComponent(parsed.pathname.slice(editorBucket.length + 2));
    }
  } catch {
    // not a URL — could be a bare key (rare); ignore for safety
  }
  return null;
}

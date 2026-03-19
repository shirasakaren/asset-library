import { Injectable } from '@nestjs/common';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { Job } from 'bullmq';
import sharp from 'sharp';
import { Readable } from 'node:stream';
import { AppConfigService } from '../../../../config/app-config.service';
import { PrismaService } from '../../../../infra/prisma/prisma.service';
import { S3Service } from '../../../../infra/s3/s3.service';
import { SentryService } from '../../../../infra/sentry/sentry.service';
import { ThumbnailVariantsJob } from '../../contracts';
import { QUEUE } from '../../queue-names';
import { JobWorkerBase } from '../../worker-base';

interface SizeSpec {
  name: string;
  width: number;
  height: number;
}

const SIZES: SizeSpec[] = [
  { name: 'thumb-1x', width: 480, height: 270 },
  { name: 'thumb-2x', width: 960, height: 540 },
  { name: 'card-1x', width: 640, height: 360 },
  { name: 'card-2x', width: 1280, height: 720 },
  { name: 'hero-1x', width: 1280, height: 720 },
  { name: 'hero-2x', width: 2560, height: 1440 },
];

/**
 * Renders six responsive WebP variants from the publisher's uploaded
 * thumbnail. Original key is untouched; derived keys live in the same
 * thumbs bucket under `thumbs/{assetId}/<size>.webp` so the CDN cache key
 * is predictable.
 */
@Injectable()
export class ThumbnailVariantsWorker extends JobWorkerBase<ThumbnailVariantsJob> {
  constructor(
    config: AppConfigService,
    sentry: SentryService,
    private readonly s3: S3Service,
    private readonly prisma: PrismaService,
  ) {
    super(QUEUE.THUMBNAIL_VARIANTS, config, sentry);
  }

  async process(job: Job<ThumbnailVariantsJob>): Promise<void> {
    const { assetId, sourceKey } = job.data;
    const source = await this.s3.client.send(
      new GetObjectCommand({ Bucket: this.s3.bucketFor('thumbs'), Key: sourceKey }),
    );
    if (!source.Body) throw new Error(`No body for thumbnail ${sourceKey}`);
    const original = await streamToBuffer(source.Body as Readable);
    const variants: Record<string, string> = {};

    for (const size of SIZES) {
      const buf = await sharp(original)
        .resize(size.width, size.height, { fit: 'cover', position: 'attention' })
        .webp({ quality: 82 })
        .toBuffer();
      const key = `thumbs/${assetId}/${size.name}.webp`;
      await this.s3.client.send(
        new PutObjectCommand({
          Bucket: this.s3.bucketFor('thumbs'),
          Key: key,
          Body: buf,
          ContentType: 'image/webp',
        }),
      );
      variants[size.name] = key;
    }

    await this.prisma.asset.update({
      where: { id: assetId },
      data: { thumbnailVariants: variants },
    });
  }
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

import { Injectable, Logger } from '@nestjs/common';
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListPartsCommand,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { AppConfigService } from '../../config/app-config.service';

export type S3BucketRole = 'assets' | 'thumbs' | 'editor';

/**
 * Thin wrapper around the AWS SDK for S3. Direct uploads from the browser /
 * editor plugin use presigned URLs (Part 2); the backend only signs them and
 * fans out completion callbacks.
 */
@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);
  public readonly client: S3Client;

  constructor(private readonly config: AppConfigService) {
    const endpoint = config.get('S3_ENDPOINT');
    this.client = new S3Client({
      region: config.get('S3_REGION'),
      ...(endpoint ? { endpoint } : {}),
      forcePathStyle: config.get('S3_FORCE_PATH_STYLE'),
      credentials: {
        accessKeyId: config.get('S3_ACCESS_KEY_ID'),
        secretAccessKey: config.get('S3_SECRET_ACCESS_KEY'),
      },
    });
  }

  bucketFor(role: S3BucketRole): string {
    switch (role) {
      case 'assets':
        return this.config.get('S3_BUCKET_ASSETS');
      case 'thumbs':
        return this.config.get('S3_BUCKET_THUMBS');
      case 'editor':
        return this.config.get('S3_BUCKET_EDITOR_MEDIA');
    }
  }

  async presignPut(
    role: S3BucketRole,
    key: string,
    contentType: string,
  ): Promise<{ url: string; expiresIn: number; bucket: string; key: string }> {
    const bucket = this.bucketFor(role);
    const expiresIn = this.config.get('S3_PRESIGN_EXPIRES_SEC');
    const command = new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType });
    const url = await getSignedUrl(this.client, command, { expiresIn });
    return { url, expiresIn, bucket, key };
  }

  async presignGet(role: S3BucketRole, key: string): Promise<string> {
    const bucket = this.bucketFor(role);
    const expiresIn = this.config.get('S3_PRESIGN_EXPIRES_SEC');
    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    return getSignedUrl(this.client, command, { expiresIn });
  }

  /**
   * Batched GET presigning for grid/list endpoints. Dedupes keys, runs them
   * through `presignGet` in fixed-size concurrent batches (cap 8), and returns
   * a `key → url` map so callers can hydrate their DTOs without an N+1.
   * Uses the same TTL semantics as `presignGet` (per-request env config).
   */
  async presignGetMany(role: S3BucketRole, keys: string[]): Promise<Record<string, string>> {
    const unique = Array.from(new Set(keys.filter((k): k is string => !!k)));
    if (unique.length === 0) return {};
    const out: Record<string, string> = {};
    const concurrency = 8;
    for (let i = 0; i < unique.length; i += concurrency) {
      const chunk = unique.slice(i, i + concurrency);
      const urls = await Promise.all(chunk.map((key) => this.presignGet(role, key)));
      chunk.forEach((key, idx) => {
        out[key] = urls[idx];
      });
    }
    return out;
  }

  async deleteObject(role: S3BucketRole, key: string): Promise<void> {
    const bucket = this.bucketFor(role);
    await this.client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  }

  async headObject(
    role: S3BucketRole,
    key: string,
  ): Promise<{ bytes: number; contentType?: string } | null> {
    try {
      const out = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucketFor(role), Key: key }),
      );
      return { bytes: Number(out.ContentLength ?? 0), contentType: out.ContentType };
    } catch (err) {
      this.logger.debug(`headObject ${key}: ${(err as Error).message}`);
      return null;
    }
  }

  // ─── Multipart ──────────────────────────────────────────────────────────

  async createMultipart(role: S3BucketRole, key: string, contentType: string): Promise<string> {
    const bucket = this.bucketFor(role);
    const out = await this.client.send(
      new CreateMultipartUploadCommand({ Bucket: bucket, Key: key, ContentType: contentType }),
    );
    if (!out.UploadId) throw new Error('S3 did not return an UploadId.');
    return out.UploadId;
  }

  async presignParts(
    role: S3BucketRole,
    key: string,
    uploadId: string,
    partNumbers: number[],
  ): Promise<Array<{ partNumber: number; url: string }>> {
    const bucket = this.bucketFor(role);
    const expiresIn = this.config.get('S3_PRESIGN_EXPIRES_SEC');
    return Promise.all(
      partNumbers.map(async (partNumber) => {
        const command = new UploadPartCommand({
          Bucket: bucket,
          Key: key,
          UploadId: uploadId,
          PartNumber: partNumber,
        });
        const url = await getSignedUrl(this.client, command, { expiresIn });
        return { partNumber, url };
      }),
    );
  }

  async completeMultipart(
    role: S3BucketRole,
    key: string,

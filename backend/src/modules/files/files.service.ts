import { Injectable } from '@nestjs/common';
import { AssetFile, AssetFileKind, AssetVersion, User } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { ErrorCode } from '../../common/errors/error-code';
import {
  BadRequestDomainException,
  ForbiddenDomainException,
  NotFoundDomainException,
} from '../../common/errors/problem.dto';
import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RedisService } from '../../infra/redis/redis.service';
import { S3Service } from '../../infra/s3/s3.service';
import { AssetsService } from '../assets/assets.service';
import { JobsProducer } from '../jobs/jobs.producer';
import {
  CompleteMultipartDto,
  InitiateMultipartDto,
  InitiateMultipartResponseDto,
  InitiateThumbnailDto,
  InitiateThumbnailResponseDto,
  InitiateUploadDto,
  InitiateUploadResponseDto,
  InitiateEditorMediaDto,
  InitiateEditorMediaResponseDto,
} from './dto/upload.dto';

interface UploadHandle {
  fileId: string | null; // null for thumbnails / editor media
  versionId?: string;
  assetId?: string;
  key: string;
  role: 'assets' | 'thumbs' | 'editor';
  s3UploadId?: string; // present only for multipart
  multipart: boolean;
}

const HANDLE_TTL_SECONDS = 24 * 60 * 60;

/**
 * Builds and signs S3 upload requests, then materializes AssetFile rows on
 * completion. Tracks each in-flight handle in Redis so the multipart sign/abort
 * endpoints can authorize against the original initiator without trusting
 * client-provided identifiers.
 */
@Injectable()
export class FilesService {
  // AWS SigV4 caps presigned URLs at 7 days (604800 s); we keep a margin and
  // expose POST /files/editor-media/refresh so the frontend can re-sign older
  // links without losing the underlying S3 object.
  private readonly editorMediaTtlSec = 6 * 24 * 60 * 60;

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly redis: RedisService,
    private readonly assets: AssetsService,
    private readonly jobs: JobsProducer,
    private readonly config: AppConfigService,
  ) {}

  // ─── Helpers ────────────────────────────────────────────────────────────

  private async getVersionOrThrow(versionId: string, requester: User): Promise<AssetVersion> {
    const version = await this.prisma.assetVersion.findUnique({
      where: { id: versionId },
      include: { asset: true },
    });
    if (!version)
      throw new NotFoundDomainException(
        ErrorCode.VERSION_NOT_FOUND,
        `Version ${versionId} not found.`,
      );
    this.assets.assertCanEdit(version.asset, requester);
    return version;
  }

  private newUploadId(): string {
    return `up_${randomUUID()}`;
  }

  private handleKey(uploadId: string): string {
    return `upload:handle:${uploadId}`;
  }

  private async saveHandle(uploadId: string, handle: UploadHandle): Promise<void> {
    await this.redis.client.set(
      this.handleKey(uploadId),
      JSON.stringify(handle),
      'EX',
      HANDLE_TTL_SECONDS,
    );
  }

  private async loadHandle(uploadId: string): Promise<UploadHandle> {
    const raw = await this.redis.client.get(this.handleKey(uploadId));
    if (!raw)
      throw new NotFoundDomainException(
        ErrorCode.FILE_UPLOAD_NOT_FOUND,
        `Upload ${uploadId} not found.`,
      );
    return JSON.parse(raw) as UploadHandle;
  }

  private async dropHandle(uploadId: string): Promise<void> {
    await this.redis.client.del(this.handleKey(uploadId));
  }

  private expiresAt(): string {
    return new Date(Date.now() + this.config.get('S3_PRESIGN_EXPIRES_SEC') * 1000).toISOString();
  }

  // ─── Single-shot uploads ────────────────────────────────────────────────

  async initiateUpload(
    dto: InitiateUploadDto,
    requester: User,
  ): Promise<InitiateUploadResponseDto> {
    const version = await this.getVersionOrThrow(dto.versionId, requester);
    if (version.assetId !== dto.assetId) {
      throw new BadRequestDomainException(
        ErrorCode.FILE_UPLOAD_INIT_FAILED,
        'assetId/versionId mismatch.',
      );
    }
    const safePath = this.normalizeRelativePath(dto.relativePath);
    const key = `${version.s3Prefix}${safePath}`;

    const file = await this.prisma.assetFile.create({
      data: {
        versionId: version.id,
        s3Key: key,
        relativePath: safePath,
        bytes: BigInt(0),
        mimeType: dto.contentType,
        kind: AssetFileKind.OTHER,
        sortOrder: await this.nextSortOrder(version.id),
      },
    });

    const presigned = await this.s3.presignPut('assets', key, dto.contentType);
    const uploadId = this.newUploadId();
    await this.saveHandle(uploadId, {
      fileId: file.id,
      versionId: version.id,
      assetId: version.assetId,
      key,
      role: 'assets',
      multipart: false,
    });
    return {
      uploadId,
      putUrl: presigned.url,
      key,
      fileId: file.id,
      expiresAt: this.expiresAt(),
    };
  }

  async completeUpload(uploadId: string, requester: User): Promise<void> {
    const handle = await this.loadHandle(uploadId);
    if (!handle.fileId || handle.multipart) {
      throw new BadRequestDomainException(
        ErrorCode.FILE_UPLOAD_INIT_FAILED,
        'Wrong completion endpoint for this upload.',
      );
    }
    if (handle.versionId) await this.getVersionOrThrow(handle.versionId, requester);

    const head = await this.s3.headObject('assets', handle.key);
    const file = await this.prisma.assetFile.update({
      where: { id: handle.fileId },
      data: {
        bytes: BigInt(head?.bytes ?? 0),
        mimeType: head?.contentType ?? undefined,
      },
    });
    await this.recountVersion(file.versionId);
    await this.dropHandle(uploadId);
    await this.enqueueAfterCompletion(file);
  }

  // ─── Multipart uploads ──────────────────────────────────────────────────

  async initiateMultipart(
    dto: InitiateMultipartDto,
    requester: User,
  ): Promise<InitiateMultipartResponseDto> {
    const version = await this.getVersionOrThrow(dto.versionId, requester);
    if (version.assetId !== dto.assetId) {
      throw new BadRequestDomainException(
        ErrorCode.FILE_UPLOAD_INIT_FAILED,
        'assetId/versionId mismatch.',
      );
    }
    const safePath = this.normalizeRelativePath(dto.relativePath);
    const key = `${version.s3Prefix}${safePath}`;

    const file = await this.prisma.assetFile.create({
      data: {
        versionId: version.id,
        s3Key: key,
        relativePath: safePath,
        bytes: BigInt(0),
        mimeType: dto.contentType,
        kind: AssetFileKind.OTHER,
        sortOrder: await this.nextSortOrder(version.id),
      },
    });

    const s3UploadId = await this.s3.createMultipart('assets', key, dto.contentType);
    const partNumbers = Array.from({ length: dto.partCount }, (_, i) => i + 1);
    const partUrls = await this.s3.presignParts('assets', key, s3UploadId, partNumbers);

    const uploadId = this.newUploadId();
    await this.saveHandle(uploadId, {
      fileId: file.id,
      versionId: version.id,
      assetId: version.assetId,
      key,
      role: 'assets',
      s3UploadId,
      multipart: true,
    });
    return {
      uploadId,
      key,
      fileId: file.id,
      partUrls,
      expiresAt: this.expiresAt(),
    };
  }

  async signMultipartParts(
    uploadId: string,
    partNumbers: number[],
    requester: User,
  ): Promise<Array<{ partNumber: number; url: string }>> {
    const handle = await this.loadHandle(uploadId);
    if (!handle.multipart || !handle.s3UploadId) {
      throw new BadRequestDomainException(
        ErrorCode.FILE_UPLOAD_INIT_FAILED,
        'Not a multipart upload.',
      );
    }
    if (handle.versionId) await this.getVersionOrThrow(handle.versionId, requester);
    return this.s3.presignParts('assets', handle.key, handle.s3UploadId, partNumbers);
  }

  async completeMultipart(dto: CompleteMultipartDto, requester: User): Promise<void> {
    const handle = await this.loadHandle(dto.uploadId);
    if (!handle.multipart || !handle.s3UploadId || !handle.fileId) {
      throw new BadRequestDomainException(
        ErrorCode.FILE_UPLOAD_INIT_FAILED,
        'Not a multipart upload.',
      );
    }
    if (handle.versionId) await this.getVersionOrThrow(handle.versionId, requester);

    // Source the authoritative ETags from S3 itself rather than trusting the
    // client. The browser can only read the PUT response's `ETag` header when
    // the bucket CORS exposes it; without that the client sends empty ETags and
    // CompleteMultipartUpload fails ("parts could not be found / entity tag may
    // not match"). ListParts is CORS-independent and always correct.
    const parts = await this.s3.listParts('assets', handle.key, handle.s3UploadId);
    if (parts.length === 0) {
      throw new BadRequestDomainException(
        ErrorCode.FILE_UPLOAD_INIT_FAILED,
        'No uploaded parts found for this upload — please re-upload the file.',
      );
    }

    await this.s3.completeMultipart('assets', handle.key, handle.s3UploadId, parts);
    const head = await this.s3.headObject('assets', handle.key);
    const file = await this.prisma.assetFile.update({
      where: { id: handle.fileId },
      data: {
        bytes: BigInt(head?.bytes ?? 0),
        mimeType: head?.contentType ?? undefined,
      },
    });
    await this.recountVersion(file.versionId);
    await this.dropHandle(dto.uploadId);
    await this.enqueueAfterCompletion(file);
  }

  async abortMultipart(uploadId: string, requester: User): Promise<void> {
    const handle = await this.loadHandle(uploadId);
    if (handle.versionId) await this.getVersionOrThrow(handle.versionId, requester);
    if (handle.s3UploadId) await this.s3.abortMultipart('assets', handle.key, handle.s3UploadId);
    if (handle.fileId) {
      await this.prisma.assetFile.delete({ where: { id: handle.fileId } }).catch(() => undefined);
      if (handle.versionId) await this.recountVersion(handle.versionId);
    }
    await this.dropHandle(uploadId);
  }

  // ─── File management (reorder / delete) ──────────────────────────────────

  /** Next sort order = current file count, so new uploads append to the end. */
  private async nextSortOrder(versionId: string): Promise<number> {
    return this.prisma.assetFile.count({ where: { versionId } });
  }

  /**
   * Persists a new file display order. `orderedFileIds` must be the full set of
   * the version's file ids; any omitted files keep their relative order after
   * the listed ones.
   */
  async reorderFiles(versionId: string, orderedFileIds: string[], requester: User): Promise<void> {
    const version = await this.getVersionOrThrow(versionId, requester);
    const files = await this.prisma.assetFile.findMany({
      where: { versionId: version.id },
      select: { id: true },
    });
    const known = new Set(files.map((f) => f.id));
    const rank = new Map<string, number>();
    orderedFileIds.forEach((id, i) => {
      if (known.has(id)) rank.set(id, i);
    });
    await this.prisma.$transaction(
      files.map((f) =>
        this.prisma.assetFile.update({
          where: { id: f.id },
          data: { sortOrder: rank.get(f.id) ?? orderedFileIds.length },
        }),
      ),
    );
  }

  /** Hard-deletes a single uploaded file (S3 object + row). Owner/admin only. */
  async deleteFile(fileId: string, requester: User): Promise<void> {
    const file = await this.prisma.assetFile.findUnique({
      where: { id: fileId },
      include: { version: { include: { asset: true } } },
    });
    if (!file)
      throw new NotFoundDomainException(
        ErrorCode.FILE_UPLOAD_NOT_FOUND,
        `File ${fileId} not found.`,
      );
    this.assets.assertCanEdit(file.version.asset, requester);
    await this.s3.deleteObject('assets', file.s3Key).catch(() => undefined);
    await this.prisma.assetFile.delete({ where: { id: fileId } });
    await this.recountVersion(file.versionId);
  }

  // ─── Thumbnails ─────────────────────────────────────────────────────────

  async initiateThumbnail(
    dto: InitiateThumbnailDto,
    requester: User,
  ): Promise<InitiateThumbnailResponseDto> {
    const asset = await this.prisma.asset.findUnique({ where: { id: dto.assetId } });
    if (!asset)
      throw new NotFoundDomainException(
        ErrorCode.ASSET_NOT_FOUND,
        `Asset ${dto.assetId} not found.`,
      );
    this.assets.assertCanEdit(asset, requester);
    const key = `thumbs/${dto.assetId}/${randomUUID()}`;
    const presigned = await this.s3.presignPut('thumbs', key, dto.contentType);
    return { putUrl: presigned.url, key, expiresAt: this.expiresAt() };
  }

  async completeThumbnail(assetId: string, key: string, requester: User): Promise<void> {
    const asset = await this.prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset)
      throw new NotFoundDomainException(ErrorCode.ASSET_NOT_FOUND, `Asset ${assetId} not found.`);
    this.assets.assertCanEdit(asset, requester);
    if (!key.startsWith(`thumbs/${assetId}/`)) {
      throw new ForbiddenDomainException(
        ErrorCode.AUTH_FORBIDDEN,
        "Thumbnail key is not in this asset's prefix.",
      );
    }
    await this.prisma.asset.update({ where: { id: assetId }, data: { thumbnailKey: key } });
    await this.jobs.enqueueThumbProcess({ assetId, thumbnailKey: key });
  }

  // ─── Editor media (TipTap embeds) ───────────────────────────────────────

  async initiateEditorMedia(
    dto: InitiateEditorMediaDto,
    requester: User,
  ): Promise<InitiateEditorMediaResponseDto> {
    const key = `editor/${requester.id}/${randomUUID()}`;
    const [presigned, viewUrl] = await Promise.all([
      this.s3.presignPut('editor', key, dto.contentType),
      this.s3.presignLongLivedGet('editor', key, this.editorMediaTtlSec),
    ]);
    return { putUrl: presigned.url, key, viewUrl, expiresAt: this.expiresAt() };
  }

  async refreshEditorMedia(
    key: string,
    _requester: User,
  ): Promise<{ viewUrl: string; expiresAt: string }> {
    if (!key.startsWith('editor/')) {
      throw new BadRequestDomainException(
        ErrorCode.FILE_UPLOAD_INIT_FAILED,
        'Editor-media key must live under the editor/ prefix.',
      );
    }
    if (key.includes('..')) {
      throw new ForbiddenDomainException(
        ErrorCode.AUTH_FORBIDDEN,
        'Editor-media key contains illegal segments.',
      );
    }
    const viewUrl = await this.s3.presignLongLivedGet('editor', key, this.editorMediaTtlSec);
    return { viewUrl, expiresAt: this.expiresAt() };
  }

  // ─── Shared post-completion plumbing ────────────────────────────────────

  private async recountVersion(versionId: string): Promise<void> {
    const agg = await this.prisma.assetFile.aggregate({
      where: { versionId },
      _sum: { bytes: true },
      _count: { _all: true },
    });
    await this.prisma.assetVersion.update({
      where: { id: versionId },
      data: {
        bytesTotal: agg._sum.bytes ?? BigInt(0),
        fileCount: agg._count._all,
      },
    });
  }

  /**
   * Schedules the analyzer for a freshly-completed file. Bumps the per-version
   * fan-in counter in Redis so the analyzer rollup fires when the last
   * per-file job for the version finishes.
   */
  private async enqueueAfterCompletion(file: AssetFile): Promise<void> {
    await this.redis.client.incr(`analyze:version:${file.versionId}:remaining`);
    await this.jobs.enqueueAnalyzeFile({ versionId: file.versionId, fileId: file.id });
  }

  /**
   * Trims leading slashes and rejects `..` segments so a malicious relative
   * path can't escape its version's S3 prefix.
   */
  private normalizeRelativePath(raw: string): string {
    const stripped = raw.replace(/^\/+/, '').trim();
    if (!stripped) {
      throw new BadRequestDomainException(
        ErrorCode.FILE_UPLOAD_INIT_FAILED,
        'relativePath is empty.',
      );
    }
    if (stripped.split('/').includes('..')) {
      throw new BadRequestDomainException(
        ErrorCode.FILE_UPLOAD_INIT_FAILED,
        'relativePath cannot contain "..".',
      );
    }
    return stripped;
  }
}

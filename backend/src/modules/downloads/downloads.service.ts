import { Injectable } from '@nestjs/common';
import { DownloadSource, User } from '@prisma/client';
import { createHash } from 'node:crypto';
import { ErrorCode } from '../../common/errors/error-code';
import { ForbiddenDomainException, NotFoundDomainException } from '../../common/errors/problem.dto';
import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { S3Service } from '../../infra/s3/s3.service';
import { JobsProducer } from '../jobs/jobs.producer';
import { DownloadFileItemDto, DownloadResponseDto, OlderVersionRefDto } from './dto/download.dto';

@Injectable()
export class DownloadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly config: AppConfigService,
    private readonly jobs: JobsProducer,
  ) {}

  /**
   * Builds the popup payload used for the "choose a file/version" UX. Does NOT
   * issue signed URLs and does NOT record Download rows — that happens in
   * `initiate`.
   */
  async options(assetId: string, versionId: string, requester: User): Promise<DownloadResponseDto> {
    const version = await this.prisma.assetVersion.findFirst({
      where: { id: versionId, assetId },
      include: { asset: true, files: true },
    });
    if (!version)
      throw new NotFoundDomainException(
        ErrorCode.VERSION_NOT_FOUND,
        `Version ${versionId} not found.`,
      );
    await this.assertDownloadAllowed(version.asset, requester);

    const olderVersions = await this.prisma.assetVersion.findMany({
      where: { assetId, id: { not: versionId }, publishedAt: { not: null } },
      orderBy: { publishedAt: 'desc' },
      select: { id: true, semver: true, publishedAt: true },
      take: 10,
    });

    return {
      asset: { id: version.asset.id, title: version.asset.title },
      version: {
        id: version.id,
        semver: version.semver,
        releaseNotes: version.releaseNotes as object | null,
      },
      files: version.files.map((f) => ({
        id: f.id,
        relativePath: f.relativePath,
        kind: f.kind,
        bytes: f.bytes.toString(),
      })),
      olderVersions: olderVersions.map((v) => this.toOlderRef(v)),
    };
  }

  /**
   * Issues signed download URLs (one per requested file, or every file in the
   * version if `fileId` is omitted), persists Download rows for analytics, and
   * auto-saves the asset into the requester's library (without disturbing
   * `hidden`).
   */
  async initiate(
    assetId: string,
    versionId: string,
    fileId: string | undefined,
    source: DownloadSource,
    requester: User,
    requestIp: string | undefined,
    userAgent: string | undefined,
  ): Promise<DownloadResponseDto> {
    const version = await this.prisma.assetVersion.findFirst({
      where: { id: versionId, assetId },
      include: { asset: true, files: true },
    });
    if (!version)
      throw new NotFoundDomainException(
        ErrorCode.VERSION_NOT_FOUND,
        `Version ${versionId} not found.`,
      );
    await this.assertDownloadAllowed(version.asset, requester);

    const targetFiles = fileId ? version.files.filter((f) => f.id === fileId) : version.files;
    if (fileId && targetFiles.length === 0) {
      throw new NotFoundDomainException(
        ErrorCode.FILE_UPLOAD_NOT_FOUND,
        `File ${fileId} not in this version.`,
      );
    }

    const ipHash = createHash('sha256')
      .update(`${requestIp ?? 'unknown'}::${this.config.get('PLUGIN_TOKEN_PEPPER') ?? ''}`)
      .digest('hex');
    const truncatedUa = (userAgent ?? '').slice(0, 512);
    const expiresInSec = this.config.get('S3_PRESIGN_EXPIRES_SEC');

    const signedFiles: DownloadFileItemDto[] = await Promise.all(
      targetFiles.map(async (f) => ({
        id: f.id,
        relativePath: f.relativePath,
        kind: f.kind,
        bytes: f.bytes.toString(),
        getUrl: await this.s3.presignLongLivedGet('assets', f.s3Key, expiresInSec),
        expiresAt: new Date(Date.now() + expiresInSec * 1000).toISOString(),
      })),
    );

    // Persist Download rows + upsert the LibraryItem in a single transaction.
    await this.prisma.$transaction([
      this.prisma.download.createMany({
        data: targetFiles.map((f) => ({
          userId: requester.id,
          assetId,
          versionId,
          fileId: f.id,
          ipHash,
          userAgent: truncatedUa,
          source,
        })),
      }),
      this.prisma.libraryItem.upsert({
        where: { userId_assetId: { userId: requester.id, assetId } },
        create: { userId: requester.id, assetId },
        // Don't touch hidden — the user may have intentionally hidden it.
        update: {},
      }),
    ]);

    // Debounced stats reindex (Part 3 worker batches these).
    await this.jobs.enqueueSearchIndex({ reason: 'asset.stats', assetId });

    const olderVersions = await this.prisma.assetVersion.findMany({
      where: { assetId, id: { not: versionId }, publishedAt: { not: null } },
      orderBy: { publishedAt: 'desc' },
      select: { id: true, semver: true, publishedAt: true },
      take: 10,
    });

    return {
      asset: { id: version.asset.id, title: version.asset.title },
      version: {
        id: version.id,
        semver: version.semver,
        releaseNotes: version.releaseNotes as object | null,
      },
      files: signedFiles,
      olderVersions: olderVersions.map((v) => this.toOlderRef(v)),
    };
  }

  private async assertDownloadAllowed(
    asset: { ownerId: string; status: string },
    requester: User,
  ): Promise<void> {
    if (asset.status === 'PUBLISHED') return;
    if (requester.isAdmin) return;
    if (asset.ownerId === requester.id) return;
    throw new ForbiddenDomainException(
      ErrorCode.AUTH_FORBIDDEN,
      'Asset is not available for download.',
    );
  }

  private toOlderRef(v: {
    id: string;
    semver: string;
    publishedAt: Date | null;
  }): OlderVersionRefDto {
    return { id: v.id, semver: v.semver, publishedAt: v.publishedAt?.toISOString() };
  }
}

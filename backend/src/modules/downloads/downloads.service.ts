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

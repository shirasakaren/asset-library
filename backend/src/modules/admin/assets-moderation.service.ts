import { Injectable } from '@nestjs/common';
import { DeleteObjectsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { Asset, AssetStatus, User } from '@prisma/client';
import { AuditService } from '../../common/audit/audit.service';
import { ErrorCode } from '../../common/errors/error-code';
import {
  BadRequestDomainException,
  NotFoundDomainException,
} from '../../common/errors/problem.dto';
import {
  MEILI_INDEX_ASSETS,
  MeilisearchService,
} from '../../infra/meilisearch/meilisearch.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { S3Service } from '../../infra/s3/s3.service';
import { CategoriesService } from '../categories/categories.service';
import { JobsProducer } from '../jobs/jobs.producer';

/**
 * Admin moderation operations. Wraps `AssetsService` for owner-style flows
 * but bypasses the owner-check, attaches admin-supplied reasons, and writes
 * dedicated audit entries (the cross-cutting interceptor still fires for the
 * route-level @AuditAction, but moderation often pre-builds the metadata).
 */
@Injectable()
export class AdminAssetsModerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly meili: MeilisearchService,
    private readonly categories: CategoriesService,
    private readonly producer: JobsProducer,
    private readonly audit: AuditService,
  ) {}

  private async findOrThrow(id: string): Promise<Asset> {
    const asset = await this.prisma.asset.findUnique({ where: { id } });
    if (!asset)
      throw new NotFoundDomainException(ErrorCode.ASSET_NOT_FOUND, `Asset ${id} not found.`);
    return asset;
  }

  async archive(id: string, admin: User, reason: string): Promise<void> {
    if (!reason || reason.trim().length === 0) {
      throw new BadRequestDomainException(
        ErrorCode.ASSET_ARCHIVE_BLOCKED,
        'A reason is required when an admin archives.',
      );
    }
    const asset = await this.findOrThrow(id);
    await this.prisma.asset.update({
      where: { id },
      data: { status: 'ARCHIVED', archivedAt: new Date() },
    });
    await this.categories.invalidateCache();
    await this.producer.enqueueSearchIndex({ reason: 'asset.archive', assetId: id });
    await this.audit.record({
      actorId: admin.id,
      action: 'asset.admin_archive',
      subjectType: 'Asset',
      subjectId: id,
      metadata: { previousStatus: asset.status, reason },
    });
  }

  async restore(id: string, admin: User): Promise<void> {
    const asset = await this.findOrThrow(id);
    if (asset.status !== 'ARCHIVED' && asset.status !== 'DELETED') {
      throw new BadRequestDomainException(
        ErrorCode.ASSET_ARCHIVE_BLOCKED,
        'Asset is not archived.',
      );
    }
    await this.prisma.asset.update({
      where: { id },
      data: { status: 'PUBLISHED', archivedAt: null, publishedAt: asset.publishedAt ?? new Date() },
    });
    await this.categories.invalidateCache();
    await this.producer.enqueueSearchIndex({ reason: 'asset.restore', assetId: id });
    await this.audit.record({
      actorId: admin.id,
      action: 'asset.admin_restore',
      subjectType: 'Asset',
      subjectId: id,
      metadata: { previousStatus: asset.status },
    });
  }

  async softDelete(id: string, admin: User, reason: string): Promise<void> {
    if (!reason || reason.trim().length === 0) {
      throw new BadRequestDomainException(
        ErrorCode.ASSET_ARCHIVE_BLOCKED,
        'A reason is required when an admin soft-deletes.',
      );
    }
    const asset = await this.findOrThrow(id);
    await this.prisma.asset.update({
      where: { id },
      data: { status: 'DELETED', archivedAt: new Date() },
    });
    await this.categories.invalidateCache();
    await this.producer.enqueueSearchIndex({ reason: 'asset.delete', assetId: id });
    await this.audit.record({
      actorId: admin.id,
      action: 'asset.admin_delete',
      subjectType: 'Asset',
      subjectId: id,
      metadata: { previousStatus: asset.status, reason },
    });

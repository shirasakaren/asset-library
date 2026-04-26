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
  }

  /**
   * Immediate hard delete — bypasses the 30-day archive clock. Used only for
   * legal takedowns / catastrophic content. Guarded by `@RequireConfirmation()`
   * at the controller.
   */
  async forceDelete(id: string, admin: User, reason: string): Promise<void> {
    const asset = await this.findOrThrow(id);
    await this.deleteS3Prefix('assets', `assets/${asset.id}/`);
    await this.deleteS3Prefix('thumbs', `thumbs/${asset.id}/`);
    if (asset.thumbnailKey && !asset.thumbnailKey.startsWith(`thumbs/${asset.id}/`)) {
      await this.s3.deleteObject('thumbs', asset.thumbnailKey).catch(() => undefined);
    }
    await this.prisma.asset.delete({ where: { id } });
    await this.meili.client
      .index(MEILI_INDEX_ASSETS)
      .deleteDocuments([`${id}:en`, `${id}:id`])
      .catch(() => undefined);
    await this.categories.invalidateCache();
    await this.audit.record({
      actorId: admin.id,
      action: 'asset.force_delete',
      subjectType: 'Asset',
      subjectId: id,
      metadata: { reason, previousStatus: asset.status, ownerId: asset.ownerId },
    });
  }

  /** Reassigns ownership (rare; useful when a contributor leaves the lab). */
  async transfer(id: string, admin: User, newOwnerId: string): Promise<void> {
    const asset = await this.findOrThrow(id);
    const target = await this.prisma.user.findUnique({ where: { id: newOwnerId } });
    if (!target || target.deletedAt) {
      throw new NotFoundDomainException(ErrorCode.USER_NOT_FOUND, `User ${newOwnerId} not found.`);
    }
    await this.prisma.asset.update({ where: { id }, data: { ownerId: newOwnerId } });
    await this.producer.enqueueSearchIndex({ reason: 'asset.update', assetId: id });
    await this.audit.record({
      actorId: admin.id,
      action: 'asset.transfer',
      subjectType: 'Asset',
      subjectId: id,
      metadata: { previousOwnerId: asset.ownerId, newOwnerId },
    });
  }

  /** Returns a sequence of header values for X-Total-<Status> on the list. */
  async statusCounts(): Promise<Record<AssetStatus, number>> {
    const rows = await this.prisma.asset.groupBy({ by: ['status'], _count: { _all: true } });
    const out: Record<AssetStatus, number> = { DRAFT: 0, PUBLISHED: 0, ARCHIVED: 0, DELETED: 0 };
    for (const r of rows) out[r.status] = r._count._all;
    return out;
  }

  private async deleteS3Prefix(role: 'assets' | 'thumbs', prefix: string): Promise<void> {
    let continuationToken: string | undefined;
    do {
      const list = await this.s3.client.send(
        new ListObjectsV2Command({
          Bucket: this.s3.bucketFor(role),
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );
      const objects = list.Contents ?? [];
      if (objects.length > 0) {
        await this.s3.client.send(
          new DeleteObjectsCommand({
            Bucket: this.s3.bucketFor(role),
            Delete: { Objects: objects.map((o) => ({ Key: o.Key! })) },
          }),
        );
      }
      continuationToken = list.IsTruncated ? list.NextContinuationToken : undefined;
    } while (continuationToken);
  }
}

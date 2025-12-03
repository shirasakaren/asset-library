import { Injectable } from '@nestjs/common';
import { FeaturedSlot, NotificationType, Prisma, User } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../../common/audit/audit.service';
import { ErrorCode } from '../../common/errors/error-code';
import { ConflictDomainException, NotFoundDomainException } from '../../common/errors/problem.dto';
import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { S3Service } from '../../infra/s3/s3.service';
import { DiscoverService } from '../assets/discover.service';
import { JobsProducer } from '../jobs/jobs.producer';
import {
  AdminFeaturedSlotDto,
  CreateFeaturedSlotDto,
  FeaturedBannerInitiateResponseDto,
  UpdateFeaturedSlotDto,
} from './dto/featured.dto';

const ACTIVE_CAP = 5;

@Injectable()
export class FeaturedService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly producer: JobsProducer,
    private readonly audit: AuditService,
    private readonly discover: DiscoverService,
    private readonly config: AppConfigService,
  ) {}

  async list(): Promise<AdminFeaturedSlotDto[]> {
    const rows = await this.prisma.featuredSlot.findMany({
      include: { asset: true },
      orderBy: [{ isActive: 'desc' }, { sortOrder: 'asc' }],
    });
    return Promise.all(rows.map((r) => this.toDto(r)));
  }

  async create(admin: User, dto: CreateFeaturedSlotDto): Promise<AdminFeaturedSlotDto> {
    const asset = await this.prisma.asset.findUnique({ where: { id: dto.assetId } });
    if (!asset)
      throw new NotFoundDomainException(
        ErrorCode.ASSET_NOT_FOUND,
        `Asset ${dto.assetId} not found.`,
      );

    const isActive = dto.isActive ?? true;
    if (isActive) {
      const activeCount = await this.prisma.featuredSlot.count({ where: { isActive: true } });
      if (activeCount >= ACTIVE_CAP) {
        throw new ConflictDomainException(
          ErrorCode.FEATURED_ACTIVE_CAP_REACHED,
          `Already ${ACTIVE_CAP} active featured slots — deactivate one before adding another.`,
        );
      }
    }
    const nextSortOrder =
      ((await this.prisma.featuredSlot.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ??
        -1) + 1;
    const row = await this.prisma.featuredSlot.create({
      data: {
        assetId: asset.id,
        sortOrder: nextSortOrder,
        isActive,
        customBannerKey: dto.customBannerKey,
        customTitle: dto.customTitle,
        customShortDescription: dto.customShortDescription ?? Prisma.JsonNull,
      },
      include: { asset: true },
    });
    await this.discover.invalidate();
    await this.audit.record({
      actorId: admin.id,
      action: 'featured.create',
      subjectType: 'FeaturedSlot',
      subjectId: row.id,
      metadata: { assetId: asset.id, isActive, sortOrder: nextSortOrder },
    });
    if (isActive && asset.ownerId !== admin.id) {
      await this.producer.enqueueNotify({
        recipientUserId: asset.ownerId,
        type: NotificationType.FEATURED_FEATURED,
        payload: {
          assetId: asset.id,
          assetSlug: asset.slug,
          assetTitle: asset.title,
          featuredAt: new Date().toISOString(),
        },
        actor: { id: admin.id, displayName: admin.displayName, email: admin.email },
      });
    }
    return this.toDto(row);
  }

  async update(id: string, admin: User, dto: UpdateFeaturedSlotDto): Promise<AdminFeaturedSlotDto> {
    const row = await this.prisma.featuredSlot.findUnique({
      where: { id },
      include: { asset: true },
    });
    if (!row)
      throw new NotFoundDomainException(
        ErrorCode.ASSET_NOT_FOUND,
        `Featured slot ${id} not found.`,
      );

    if (dto.isActive === true && !row.isActive) {
      const activeCount = await this.prisma.featuredSlot.count({ where: { isActive: true } });
      if (activeCount >= ACTIVE_CAP) {
        throw new ConflictDomainException(
          ErrorCode.FEATURED_ACTIVE_CAP_REACHED,
          `Already ${ACTIVE_CAP} active featured slots.`,
        );
      }
    }

    const updated = await this.prisma.featuredSlot.update({
      where: { id },
      data: {
        customBannerKey: dto.customBannerKey ?? row.customBannerKey,
        customTitle: dto.customTitle ?? row.customTitle,
        customShortDescription:
          dto.customShortDescription === undefined
            ? (row.customShortDescription ?? Prisma.JsonNull)

import { Injectable } from '@nestjs/common';
import { Asset } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { SEMVER_REGEX } from './dto/asset.dto';

export interface PublishViolation {
  field: string;
  code: string;
  message: string;
  /** Soft violations are warnings the publisher can confirm-through. */
  severity: 'error' | 'warning';
}

@Injectable()
export class PublishChecklistService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns the full list of publish violations for an asset. Empty = OK to
   * publish without any confirmations. Callers wrap warnings in their own
   * confirmation flow (see AssetsService.publish).
   */
  async evaluate(asset: Asset): Promise<PublishViolation[]> {
    const violations: PublishViolation[] = [];

    if (!asset.thumbnailKey) {
      violations.push({
        field: 'thumbnail',
        code: 'thumbnail.missing',
        message: 'Upload a thumbnail before publishing.',
        severity: 'error',
      });
    }
    if (!asset.licenseId) {
      violations.push({
        field: 'license',
        code: 'license.missing',
        message: 'Select a license.',
        severity: 'error',
      });
    }
    if (!asset.categoryId) {
      violations.push({
        field: 'category',
        code: 'category.missing',
        message: 'Select a category.',
        severity: 'error',
      });
    }

    const translations = await this.prisma.assetTranslation.count({ where: { assetId: asset.id } });
    if (translations === 0) {
      violations.push({
        field: 'translations',
        code: 'translations.empty',
        message: 'Provide at least one localized description.',
        severity: 'error',
      });
    }

    const latest = await this.prisma.assetVersion.findFirst({
      where: { assetId: asset.id },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { files: true, compatibility: true } } },
    });
    if (!latest) {
      violations.push({
        field: 'version',
        code: 'version.missing',
        message: 'Create at least one version.',
        severity: 'error',
      });
      return violations;
    }

    if (!SEMVER_REGEX.test(latest.semver)) {
      violations.push({
        field: 'version.semver',

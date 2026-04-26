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

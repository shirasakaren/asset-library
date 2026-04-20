import { Injectable } from '@nestjs/common';
import { AssetVersion, Prisma, User } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code';
import {
  BadRequestDomainException,
  ConflictDomainException,
  NotFoundDomainException,
} from '../../common/errors/problem.dto';
import { validateLiteTipTap } from '../../common/tiptap/validate';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RedisService } from '../../infra/redis/redis.service';
import { AssetsService } from '../assets/assets.service';
import { JobsProducer } from '../jobs/jobs.producer';
import {
  CompatibilityRowDto,
  CreateVersionDto,
  UpdateVersionDto,
  VersionSummaryDto,
} from './dto/version.dto';

@Injectable()
export class VersionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assets: AssetsService,
    private readonly jobs: JobsProducer,
    private readonly redis: RedisService,
  ) {}

  /**
   * Re-runs the analyzer + AV scan for every file in a version. Used by
   * `POST /assets/:id/versions/:vid/reanalyze` when a previous run failed
   * (per Part 3 §3.4). Bumps the fan-in counters so rollup fires exactly
   * once when this batch completes.
   */
  async reanalyze(versionId: string, requester: User): Promise<void> {
    const version = await this.prisma.assetVersion.findUnique({
      where: { id: versionId },
      include: { asset: true, files: true },
    });
    if (!version)
      throw new NotFoundDomainException(
        ErrorCode.VERSION_NOT_FOUND,
        `Version ${versionId} not found.`,
      );
    this.assets.assertCanEdit(version.asset, requester);
    if (version.files.length === 0) return;

    // Reset the rollup status so the UI can show "analyzing" again.
    await this.prisma.assetVersion.update({
      where: { id: versionId },
      data: { analysisStatus: 'PENDING' },
    });

    await this.redis.client.set(`analyze:version:${versionId}:remaining`, version.files.length);

    await Promise.all(
      version.files.map((f) => this.jobs.enqueueAnalyzeFile({ versionId, fileId: f.id })),
    );
  }

  private toSummary(v: AssetVersion): VersionSummaryDto {
    return {
      id: v.id,
      semver: v.semver,
      isLatest: v.isLatest,
      analysisStatus: v.analysisStatus,
      publishedAt: v.publishedAt?.toISOString(),
      bytesTotal: v.bytesTotal.toString(),
      fileCount: v.fileCount,
      createdAt: v.createdAt.toISOString(),
    };
  }

  async list(assetId: string, requester: User | null): Promise<VersionSummaryDto[]> {
    const asset = await this.prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset)
      throw new NotFoundDomainException(ErrorCode.ASSET_NOT_FOUND, `Asset ${assetId} not found.`);
    const isOwnerOrAdmin = !!requester && (requester.id === asset.ownerId || requester.isAdmin);
    const rows = await this.prisma.assetVersion.findMany({
      where: {
        assetId,
        ...(isOwnerOrAdmin ? {} : { publishedAt: { not: null }, analysisStatus: 'READY' }),
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.toSummary(r));
  }

  async create(assetId: string, dto: CreateVersionDto, requester: User): Promise<{ id: string }> {
    const asset = await this.prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset)
      throw new NotFoundDomainException(ErrorCode.ASSET_NOT_FOUND, `Asset ${assetId} not found.`);
    this.assets.assertCanEdit(asset, requester);

    const duplicate = await this.prisma.assetVersion.findUnique({
      where: { assetId_semver: { assetId, semver: dto.semver } },
    });
    if (duplicate) {
      throw new ConflictDomainException(
        ErrorCode.VERSION_DUPLICATE,
        `Version ${dto.semver} already exists.`,
      );
    }

    const releaseNotes = dto.releaseNotes ? this.validateReleaseNotes(dto.releaseNotes) : {};

    const created = await this.prisma.assetVersion.create({
      data: {
        assetId,
        semver: dto.semver,
        releaseNotes: releaseNotes as unknown as Prisma.InputJsonValue,
        s3Prefix: `assets/${assetId}/v${dto.semver}/`,
      },
      select: { id: true },
    });
    return created;
  }

  async update(versionId: string, dto: UpdateVersionDto, requester: User): Promise<void> {
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

    if (dto.releaseNotes) {
      const releaseNotes = this.validateReleaseNotes(dto.releaseNotes);
      await this.prisma.assetVersion.update({
        where: { id: versionId },
        data: { releaseNotes: releaseNotes as unknown as Prisma.InputJsonValue },
      });
    }
  }

  async publish(versionId: string, requester: User): Promise<void> {
    const version = await this.prisma.assetVersion.findUnique({
      where: { id: versionId },
      include: { asset: true, _count: { select: { files: true } } },
    });
    if (!version)
      throw new NotFoundDomainException(
        ErrorCode.VERSION_NOT_FOUND,
        `Version ${versionId} not found.`,
      );
    this.assets.assertCanEdit(version.asset, requester);

    if (version._count.files === 0) {
      throw new BadRequestDomainException(
        ErrorCode.ASSET_PUBLISH_BLOCKED,
        'Version has no files — upload at least one before publishing.',
      );
    }
    // Async publish: we no longer block on analyzer / AV completion. Both run
    // in the background and surface their status (PENDING / READY / FAILED /
    // CLEAN / INFECTED / SKIPPED_SIZE) on the asset detail page. Files flagged
    // INFECTED are quarantined separately by the AV worker.

    // Transactionally flip isLatest off on the previous winner, then on this row.
    await this.prisma.$transaction([
      this.prisma.assetVersion.updateMany({
        where: { assetId: version.assetId, isLatest: true, id: { not: versionId } },
        data: { isLatest: false },
      }),
      this.prisma.assetVersion.update({
        where: { id: versionId },
        data: { isLatest: true, publishedAt: new Date() },
      }),
    ]);
    await this.jobs.enqueueSearchIndex({ reason: 'asset.update', assetId: version.assetId });
  }

  async setCompatibility(
    versionId: string,
    rows: CompatibilityRowDto[],
    requester: User,
  ): Promise<void> {
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

    await this.prisma.$transaction([
      this.prisma.engineCompatibility.deleteMany({ where: { versionId } }),
      this.prisma.engineCompatibility.createMany({
        data: rows.map((r) => ({
          versionId,
          engineVersion: r.engineVersion,
          renderPipelines: r.renderPipelines ?? [],
          targets: r.targets,
        })),
      }),
    ]);
  }

  /**
   * Release notes are `{ en?: TipTapDoc, id?: TipTapDoc }`. Validate each locale's
   * doc against the Lite TipTap schema. Unknown keys are stripped.
   */
  private validateReleaseNotes(input: object): object {
    const out: Record<string, unknown> = {};
    for (const locale of ['en', 'id'] as const) {
      const doc = (input as Record<string, unknown>)[locale];
      if (doc) out[locale] = validateLiteTipTap(doc);
    }
    return out;
  }
}

import { Injectable } from '@nestjs/common';
import { Asset, AssetEngine, AssetStatus, Locale, Prisma, User } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code';
import {
  BadRequestDomainException,
  ConflictDomainException,
  ForbiddenDomainException,
  NotFoundDomainException,
} from '../../common/errors/problem.dto';
import { validateFullTipTap } from '../../common/tiptap/validate';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { JobsProducer } from '../jobs/jobs.producer';
import { TagsService } from '../tags/tags.service';
import { CategoriesService } from '../categories/categories.service';
import { LicensesService } from '../licenses/licenses.service';
import { AssetMapperService } from './asset-mapper.service';
import { AssetDetailDto, CreateAssetDto, UpdateAssetDto } from './dto/asset.dto';
import { appendSlugSuffix, slugify } from './slug';
import { PublishChecklistService, PublishViolation } from './publish-checklist.service';

const FULL_INCLUDE = {
  owner: true,
  category: true,
  license: true,
  translations: true,
  tags: { include: { tag: true } },
  versions: {
    include: {
      files: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
      compatibility: true,
      dependencies: true,
    },
  },
  _count: { select: { libraryItems: true, downloads: true } },
} satisfies Prisma.AssetInclude;

@Injectable()
export class AssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tags: TagsService,
    private readonly categories: CategoriesService,
    private readonly licenses: LicensesService,
    private readonly mapper: AssetMapperService,
    private readonly publishChecklist: PublishChecklistService,
    private readonly jobs: JobsProducer,
  ) {}

  // ─── Authorization helpers ────────────────────────────────────────────────

  assertCanEdit(asset: Asset, user: User): void {
    if (user.isAdmin) return;
    if (user.id !== asset.ownerId) {
      throw new ForbiddenDomainException(ErrorCode.AUTH_FORBIDDEN, 'You do not own this asset.');
    }
  }

  // ─── Slug allocation ──────────────────────────────────────────────────────

  private async allocateSlug(title: string): Promise<string> {
    let slug = slugify(title);
    for (let attempt = 0; attempt < 5; attempt++) {
      const taken = await this.prisma.asset.findUnique({ where: { slug } });
      if (!taken) return slug;
      slug = appendSlugSuffix(slug);
    }
    throw new ConflictDomainException(
      ErrorCode.ASSET_SLUG_TAKEN,
      'Could not derive a unique slug — try a different title.',
    );
  }

  // ─── Create ───────────────────────────────────────────────────────────────

  async create(dto: CreateAssetDto, owner: User): Promise<{ id: string; slug: string }> {
    await this.categories.findByIdOrThrow(dto.categoryId);
    await this.licenses.findByIdOrThrow(dto.licenseId);

    // Validate every TipTap document up front.
    const translationData = dto.translations.map((t) => ({
      locale: t.locale,
      shortDescription: t.shortDescription,
      longDescription: validateFullTipTap(t.longDescription) as unknown as Prisma.InputJsonValue,
    }));

    const slug = await this.allocateSlug(dto.title);

    const tagRows = dto.tags?.length ? await this.tags.upsertMany(dto.tags) : [];

    const result = await this.prisma.$transaction(async (tx) => {
      const asset = await tx.asset.create({
        data: {
          slug,
          title: dto.title,
          ownerId: owner.id,
          categoryId: dto.categoryId,
          licenseId: dto.licenseId,
          engine: dto.engine,
          status: 'DRAFT',
          requiresEmptyProject: dto.requiresEmptyProject ?? false,
          translations: { createMany: { data: translationData } },
          versions: {
            create: {
              semver: dto.semver,
              releaseNotes: {},
              s3Prefix: `assets/__pending__/v${dto.semver}/`,
              isLatest: true,
            },
          },
          tags: {
            create: tagRows.map((t) => ({ tagId: t.id })),
          },
        },
      });
      // Patch s3Prefix now that we know the asset id.
      await tx.assetVersion.updateMany({
        where: { assetId: asset.id },
        data: { s3Prefix: `assets/${asset.id}/v${dto.semver}/` },
      });
      return asset;
    });

    await this.categories.invalidateCache();
    return { id: result.id, slug: result.slug };
  }

  // ─── Read ─────────────────────────────────────────────────────────────────

  async findFullByIdOrSlug(idOrSlug: string) {
    const asset = await this.prisma.asset.findFirst({
      where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
      include: FULL_INCLUDE,
    });
    if (!asset) {
      throw new NotFoundDomainException(ErrorCode.ASSET_NOT_FOUND, `Asset ${idOrSlug} not found.`);
    }
    return asset;
  }

  async getDetail(
    idOrSlug: string,
    requester: User | null,
    locale: Locale,
  ): Promise<AssetDetailDto> {
    const asset = await this.findFullByIdOrSlug(idOrSlug);
    const isOwnerOrAdmin = !!requester && (requester.id === asset.ownerId || requester.isAdmin);
    if (asset.status !== 'PUBLISHED' && !isOwnerOrAdmin) {
      throw new NotFoundDomainException(ErrorCode.ASSET_NOT_FOUND, `Asset ${idOrSlug} not found.`);
    }
    let isSaved = false;
    if (requester) {
      const lib = await this.prisma.libraryItem.findUnique({
        where: { userId_assetId: { userId: requester.id, assetId: asset.id } },
      });
      isSaved = !!lib;
    }
    return this.mapper.toDetail(asset, {
      locale,
      requester,
      isSaved,
      totalDownloads: asset._count.downloads,
      totalSaves: asset._count.libraryItems,
    });
  }

  // ─── Update ───────────────────────────────────────────────────────────────

  async update(id: string, dto: UpdateAssetDto, requester: User): Promise<void> {
    const asset = await this.prisma.asset.findUnique({ where: { id } });
    if (!asset)
      throw new NotFoundDomainException(ErrorCode.ASSET_NOT_FOUND, `Asset ${id} not found.`);
    this.assertCanEdit(asset, requester);

    const data: Prisma.AssetUpdateInput = {};
    if (dto.title) data.title = dto.title;
    if (dto.slug && dto.slug !== asset.slug) {
      if (asset.status === 'PUBLISHED') {
        throw new BadRequestDomainException(
          ErrorCode.ASSET_PUBLISH_BLOCKED,
          'Slug is locked once an asset is published.',
        );
      }
      const collision = await this.prisma.asset.findUnique({ where: { slug: dto.slug } });
      if (collision && collision.id !== id) {
        throw new ConflictDomainException(
          ErrorCode.ASSET_SLUG_TAKEN,
          `Slug "${dto.slug}" is already taken.`,
        );
      }
      data.slug = dto.slug;
    }
    if (dto.engine && dto.engine !== asset.engine) {
      if (asset.status === 'PUBLISHED') {
        throw new BadRequestDomainException(
          ErrorCode.ASSET_PUBLISH_BLOCKED,
          'Engine is locked once an asset is published.',
        );
      }
      data.engine = dto.engine;
    }
    if (dto.categoryId) {
      await this.categories.findByIdOrThrow(dto.categoryId);
      data.category = { connect: { id: dto.categoryId } };
    }
    if (dto.licenseId) {
      await this.licenses.findByIdOrThrow(dto.licenseId);
      data.license = { connect: { id: dto.licenseId } };
    }
    if (typeof dto.requiresEmptyProject === 'boolean') {
      data.requiresEmptyProject = dto.requiresEmptyProject;
    }
    if (dto.previewMedia) {
      // Strip any client-supplied URLs — we always re-sign from the keys on
      // read. The array order IS the gallery order. Capped at 24 items.
      data.previewMedia = dto.previewMedia.slice(0, 24).map((m) => ({
        id: m.id,
        kind: m.kind,
        key: m.key,
        displayKey: m.displayKey ?? null,
        label: m.label,
        mime: m.mime ?? null,
        visibility: m.visibility ?? 'visible',
        warning: m.warning ?? null,
      })) as unknown as Prisma.InputJsonValue;
    }

    await this.prisma.$transaction(async (tx) => {
      if (dto.translations) {
        for (const translation of dto.translations) {
          const longDescription = validateFullTipTap(
            translation.longDescription,
          ) as unknown as Prisma.InputJsonValue;
          await tx.assetTranslation.upsert({
            where: { assetId_locale: { assetId: id, locale: translation.locale } },
            create: {
              assetId: id,
              locale: translation.locale,
              shortDescription: translation.shortDescription,
              longDescription,
            },
            update: {
              shortDescription: translation.shortDescription,
              longDescription,
            },
          });
        }
      }
      if (dto.tags) {
        const tagRows = await this.tags.upsertMany(dto.tags, tx);
        await tx.assetTag.deleteMany({ where: { assetId: id } });
        await tx.assetTag.createMany({
          data: tagRows.map((t) => ({ assetId: id, tagId: t.id })),
        });
      }
      if (dto.semver) {
        // The wizard sends semver alongside other asset fields, but it
        // belongs to the latest AssetVersion row. Update there.
        const latest = await tx.assetVersion.findFirst({
          where: { assetId: id },
          orderBy: [{ isLatest: 'desc' }, { createdAt: 'desc' }],
        });
        if (latest && latest.semver !== dto.semver) {
          if (latest.publishedAt) {
            throw new BadRequestDomainException(
              ErrorCode.ASSET_PUBLISH_BLOCKED,
              'Semver is locked once a version is published.',
            );
          }
          if (!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(dto.semver)) {
            throw new BadRequestDomainException(
              ErrorCode.ASSET_PUBLISH_BLOCKED,
              `"${dto.semver}" is not a valid semver string.`,
            );
          }
          const dupe = await tx.assetVersion.findUnique({
            where: { assetId_semver: { assetId: id, semver: dto.semver } },
          });
          if (dupe && dupe.id !== latest.id) {
            throw new ConflictDomainException(
              ErrorCode.VERSION_DUPLICATE,
              `Version ${dto.semver} already exists for this asset.`,
            );
          }
          await tx.assetVersion.update({
            where: { id: latest.id },
            data: {
              semver: dto.semver,
              s3Prefix: `assets/${id}/v${dto.semver}/`,
            },
          });
        }
      }
      if (Object.keys(data).length) {
        await tx.asset.update({ where: { id }, data });
      }
    });

    await this.categories.invalidateCache();
    if (asset.status === 'PUBLISHED') {
      await this.jobs.enqueueSearchIndex({ reason: 'asset.update', assetId: id });
    }
  }

  // ─── Publish / Archive / Restore / Delete ─────────────────────────────────

  async publish(
    id: string,
    requester: User,
    _confirmInfectedWarning: boolean,
  ): Promise<PublishViolation[]> {
    const asset = await this.prisma.asset.findUnique({ where: { id } });
    if (!asset)
      throw new NotFoundDomainException(ErrorCode.ASSET_NOT_FOUND, `Asset ${id} not found.`);
    this.assertCanEdit(asset, requester);

    const violations = await this.publishChecklist.evaluate(asset);
    const hardErrors = violations.filter((v) => v.severity === 'error');

    if (hardErrors.length > 0) {
      throw new BadRequestDomainException(
        ErrorCode.ASSET_PUBLISH_BLOCKED,
        'Publish blocked by checklist failures.',
        hardErrors.map((v) => ({ path: v.field, code: v.code, message: v.message })),
      );
    }

    const latest = await this.prisma.assetVersion.findFirst({
      where: { assetId: id },
      orderBy: { createdAt: 'desc' },
    });
    await this.prisma.$transaction([
      this.prisma.asset.update({
        where: { id },
        data: { status: 'PUBLISHED', publishedAt: new Date() },
      }),
      ...(latest && !latest.publishedAt
        ? [
            this.prisma.assetVersion.update({
              where: { id: latest.id },
              data: { publishedAt: new Date() },
            }),
          ]
        : []),
    ]);

    await this.categories.invalidateCache();
    await this.jobs.enqueueSearchIndex({ reason: 'asset.publish', assetId: id });
    return [];
  }

  async archive(id: string, requester: User): Promise<void> {
    await this.transitionStatus(id, requester, 'ARCHIVED', 'asset.archive');
  }

  async restore(id: string, requester: User): Promise<void> {
    const asset = await this.prisma.asset.findUnique({ where: { id } });
    if (!asset)
      throw new NotFoundDomainException(ErrorCode.ASSET_NOT_FOUND, `Asset ${id} not found.`);
    this.assertCanEdit(asset, requester);
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
    await this.jobs.enqueueSearchIndex({ reason: 'asset.restore', assetId: id });
  }

  async softDelete(id: string, requester: User): Promise<void> {
    await this.transitionStatus(id, requester, 'DELETED', 'asset.delete');
  }

  private async transitionStatus(
    id: string,
    requester: User,
    next: AssetStatus,
    reason: 'asset.archive' | 'asset.delete',
  ): Promise<void> {
    const asset = await this.prisma.asset.findUnique({ where: { id } });
    if (!asset)
      throw new NotFoundDomainException(ErrorCode.ASSET_NOT_FOUND, `Asset ${id} not found.`);
    this.assertCanEdit(asset, requester);
    await this.prisma.asset.update({
      where: { id },
      data: { status: next, archivedAt: new Date() },
    });
    await this.categories.invalidateCache();
    await this.jobs.enqueueSearchIndex({ reason, assetId: id });
  }

  // ─── List ─────────────────────────────────────────────────────────────────

  /**
   * Builds the Prisma WHERE for the assets list given filter args. Used by
   * both `/assets` and (with q stripped) the hydrate-after-Meilisearch path.
   */
  buildWhere(filters: {
    engine?: AssetEngine;
    categoryIds?: string[];
    tagSlugs?: string[];
    fileKinds?: string[];
    licenseSlug?: string;
    renderPipelines?: string[];
    targets?: string[];
    ownerId?: string;
    statuses?: AssetStatus[];
  }): Prisma.AssetWhereInput {
    const where: Prisma.AssetWhereInput = {
      status: { in: filters.statuses ?? ['PUBLISHED'] },
    };
    if (filters.engine) where.engine = filters.engine;
    if (filters.categoryIds?.length) where.categoryId = { in: filters.categoryIds };
    if (filters.ownerId) where.ownerId = filters.ownerId;
    if (filters.licenseSlug) where.license = { slug: filters.licenseSlug };
    if (filters.tagSlugs?.length) {
      where.tags = { some: { tag: { slug: { in: filters.tagSlugs } } } };
    }
    if (filters.fileKinds?.length) {
      where.versions = {
        some: { files: { some: { kind: { in: filters.fileKinds as never[] } } } },
      };
    }
    if (filters.renderPipelines?.length || filters.targets?.length) {
      const compatWhere: Prisma.EngineCompatibilityWhereInput = {};
      if (filters.renderPipelines?.length)
        compatWhere.renderPipelines = { hasSome: filters.renderPipelines };
      if (filters.targets?.length) compatWhere.targets = { hasSome: filters.targets };
      where.versions = where.versions ?? {};
      (where.versions as Prisma.AssetVersionListRelationFilter).some = {
        ...((where.versions as Prisma.AssetVersionListRelationFilter).some ?? {}),
        compatibility: { some: compatWhere },
      };
    }
    return where;
  }

  // ─── Recommended ──────────────────────────────────────────────────────────

  async recommended(assetId: string, locale: Locale) {
    const asset = await this.prisma.asset.findUnique({
      where: { id: assetId },
      include: { tags: true },
    });
    if (!asset)
      throw new NotFoundDomainException(ErrorCode.ASSET_NOT_FOUND, `Asset ${assetId} not found.`);

    const tagIds = asset.tags.map((t) => t.tagId);
    const candidates = await this.prisma.asset.findMany({
      where: {
        id: { not: assetId },
        status: 'PUBLISHED',
        engine: asset.engine,
        OR: [
          { categoryId: asset.categoryId },
          ...(tagIds.length ? [{ tags: { some: { tagId: { in: tagIds } } } }] : []),
        ],
      },
      include: { ...FULL_INCLUDE, versions: false },
      orderBy: [{ downloads: { _count: 'desc' } }, { publishedAt: 'desc' }],
      take: 6,
    });
    // toSummaryMany batches every candidate's thumbnail presign into a single
    // round-trip; was N×presignGet via Promise.all(candidates.map(toSummary)).
    return this.mapper.toSummaryMany(
      candidates.map(
        (c) =>
          ({ ...c, versions: [] }) as unknown as Parameters<
            AssetMapperService['toSummaryMany']
          >[0][number],
      ),
      locale,
    );
  }
}

import { Injectable, OnModuleInit } from '@nestjs/common';
import { Locale, Prisma } from '@prisma/client';
import { Job } from 'bullmq';
import { AppConfigService } from '../../../../config/app-config.service';
import {
  MEILI_INDEX_ASSETS,
  MEILI_INDEX_TAGS,
  MeilisearchService,
} from '../../../../infra/meilisearch/meilisearch.service';
import { PrismaService } from '../../../../infra/prisma/prisma.service';
import { RedisService } from '../../../../infra/redis/redis.service';
import { S3Service } from '../../../../infra/s3/s3.service';
import { SentryService } from '../../../../infra/sentry/sentry.service';
import { SearchIndexBatchJob } from '../../contracts';
import { QUEUE } from '../../queue-names';
import { JobWorkerBase } from '../../worker-base';
import { SEARCH_DIRTY_SET } from './search-index.worker';

interface AssetDocument {
  id: string;
  assetId: string;
  locale: Locale;
  slug: string;
  title: string;
  shortDescription: string;
  tags: string[];
  tagsDisplay: string[];
  engine: string;
  categoryId: string;
  categorySlug: string;
  categoryName: string;
  licenseId: string;
  licenseSlug: string;
  ownerId: string;
  ownerDisplayName: string;
  renderPipelines: string[];
  targets: string[];
  fileKinds: string[];
  publishedAt: number;
  createdAt: number;
  updatedAt: number;
  totalDownloads: number;
  totalSaves: number;
  thumbnailUrl: string;
  status: string;
}

/**
 * Cadenced batch worker. On each tick it drains the Redis SET, rebuilds
 * per-asset×locale documents, applies index settings if they drifted, and
 * mirrors `TagUsage` into the tags index for autocomplete.
 *
 * Drained assets that the lookup can't find (deleted before we ran) are
 * removed from Meilisearch.
 */
@Injectable()
export class SearchIndexBatchWorker
  extends JobWorkerBase<SearchIndexBatchJob>
  implements OnModuleInit
{
  constructor(
    config: AppConfigService,
    sentry: SentryService,
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly meili: MeilisearchService,
  ) {
    super(QUEUE.SEARCH_INDEX_BATCH, config, sentry, { concurrency: 1 });
  }

  override async onModuleInit(): Promise<void> {
    super.onModuleInit();
    await this.ensureSettings();
  }

  override async process(_job: Job<SearchIndexBatchJob>): Promise<void> {
    const ids: string[] = await this.redis.client.smembers(SEARCH_DIRTY_SET);
    if (ids.length === 0) return;
    // Atomically empty the set so concurrent enqueues collect into a fresh batch.
    await this.redis.client.del(SEARCH_DIRTY_SET);

    const docs: AssetDocument[] = [];
    const toRemove: string[] = [];
    for (const assetId of ids) {
      const built = await this.buildDocsForAsset(assetId);
      if (built.length === 0) {
        toRemove.push(`${assetId}:en`, `${assetId}:id`);
      } else {
        docs.push(...built);
      }
    }
    const index = this.meili.client.index(MEILI_INDEX_ASSETS);
    if (docs.length) await index.addDocuments(docs);
    if (toRemove.length) await index.deleteDocuments(toRemove);
    await this.mirrorTagUsage();
  }

  private async buildDocsForAsset(assetId: string): Promise<AssetDocument[]> {
    const asset = await this.prisma.asset.findUnique({
      where: { id: assetId },
      include: {
        owner: true,
        category: true,
        license: true,
        translations: true,
        tags: { include: { tag: true } },
        versions: { include: { files: true, compatibility: true } },
        stats: true,
      },
    });
    if (!asset) return [];
    if (asset.status !== 'PUBLISHED') return [];

    const latest = asset.versions
      .slice()
      .sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0))[0];
    const renderPipelines = Array.from(
      new Set(latest?.compatibility.flatMap((c) => c.renderPipelines) ?? []),
    );
    const targets = Array.from(new Set(latest?.compatibility.flatMap((c) => c.targets) ?? []));
    const fileKinds = Array.from(new Set(latest?.files.map((f) => f.kind) ?? []));
    const thumbnailUrl = asset.thumbnailKey
      ? await this.s3.presignGet('thumbs', asset.thumbnailKey)
      : '';

    const baseDoc = {
      assetId: asset.id,
      slug: asset.slug,
      title: asset.title,
      tags: asset.tags.map((t) => t.tag.slug),
      tagsDisplay: asset.tags.map((t) => t.tag.displayName),
      engine: asset.engine,
      categoryId: asset.categoryId,
      categorySlug: asset.category.slug,
      licenseId: asset.licenseId,
      licenseSlug: asset.license.slug,
      ownerId: asset.ownerId,
      ownerDisplayName: asset.owner.displayName,
      renderPipelines,
      targets,
      fileKinds,
      publishedAt: Math.floor((asset.publishedAt?.getTime() ?? 0) / 1000),
      createdAt: Math.floor(asset.createdAt.getTime() / 1000),
      updatedAt: Math.floor(asset.updatedAt.getTime() / 1000),
      totalDownloads: asset.stats?.totalDownloads ?? 0,
      totalSaves: asset.stats?.totalSaves ?? 0,
      thumbnailUrl,
      status: asset.status,
    };

    return asset.translations.map((t) => ({
      id: `${asset.id}:${t.locale}`,
      locale: t.locale,
      categoryName:
        this.pickJsonLocalized(asset.category.name as Prisma.JsonValue, t.locale) ??
        asset.category.slug,
      shortDescription: t.shortDescription,
      ...baseDoc,
    }));
  }

  /**
   * Mirrors TagUsage rows into the `tags` Meilisearch index so the
   * autocomplete endpoint has fresh usageCount values.
   */
  private async mirrorTagUsage(): Promise<void> {
    const rows = await this.prisma.tagUsage.findMany({
      include: { tag: true },
      orderBy: { usageCount: 'desc' },
      take: 5000,
    });
    if (rows.length === 0) return;
    const docs = rows.map((r) => ({
      id: r.tagId,
      slug: r.tag.slug,
      displayName: r.tag.displayName,
      usageCount: r.usageCount,
    }));
    await this.meili.client.index(MEILI_INDEX_TAGS).addDocuments(docs);
  }

  private pickJsonLocalized(value: Prisma.JsonValue, locale: Locale): string | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const obj = value as Record<string, unknown>;
    const v = obj[locale] ?? obj.en;
    return typeof v === 'string' ? v : undefined;
  }

  private async ensureSettings(): Promise<void> {
    const assets = this.meili.client.index(MEILI_INDEX_ASSETS);
    try {
      await assets.updateSearchableAttributes([
        'title',
        'shortDescription',
        'tagsDisplay',
        'ownerDisplayName',
        'categoryName',
      ]);
      await assets.updateFilterableAttributes([
        'locale',
        'engine',
        'categoryId',
        'categorySlug',
        'licenseSlug',
        'tags',
        'renderPipelines',
        'targets',
        'fileKinds',
        'ownerId',
        'status',
      ]);
      await assets.updateSortableAttributes([
        'publishedAt',
        'createdAt',
        'totalDownloads',
        'totalSaves',
        'title',
      ]);
      await assets.updateDistinctAttribute('assetId');
    } catch (err) {
      this.logger.warn(`Could not apply Meilisearch settings: ${(err as Error).message}`);
    }
  }
}

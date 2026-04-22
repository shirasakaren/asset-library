import { Injectable } from '@nestjs/common';
import { Locale } from '@prisma/client';
import { resolveLocalized, LocalizedJson } from '../../common/i18n/locale-resolver';
import {
  MEILI_INDEX_ASSETS,
  MEILI_INDEX_TAGS,
  MeilisearchService,
} from '../../infra/meilisearch/meilisearch.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { S3Service } from '../../infra/s3/s3.service';
import { TagDto } from '../tags/dto/tag.dto';
import { SearchAssetHitDto, SearchAssetsQueryDto, SearchAssetsResponseDto } from './dto/search.dto';

interface AssetIndexDocument {
  id: string;
  slug: string;
  title: string;
  shortDescription_en?: string;
  shortDescription_id?: string;
  thumbnailKey?: string;
  engine: string;
  categoryId: string;
  categoryName_en?: string;
  categoryName_id?: string;
  licenseId: string;
  tags: string[];
  renderPipelines: string[];
  targets: string[];
  fileKinds: string[];
  ownerDisplayName: string;
  publishedAt: number; // unix ms — Meilisearch likes numeric sortables
  createdAt: number;
  totalDownloads: number;
  totalSaves: number;
}

@Injectable()
export class SearchService {
  constructor(
    private readonly meili: MeilisearchService,
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
  ) {}

  // ─── Search ─────────────────────────────────────────────────────────────

  async searchAssets(query: SearchAssetsQueryDto): Promise<SearchAssetsResponseDto> {
    const locale: Locale = (query.locale as Locale) ?? 'en';
    const filter = this.buildFilter(query);
    const index = this.meili.client.index(MEILI_INDEX_ASSETS);
    const result = await index.search<AssetIndexDocument>(query.q, {
      limit: query.limit ?? 24,
      offset: query.offset ?? 0,
      filter,
      sort: ['publishedAt:desc'],
    });
    // Batch-presign every hit's thumbnail in one bounded-concurrency pass
    // instead of awaiting per-row inside a .map(async) — that was a 24×
    // S3 RPC round-trip per page.
    const thumbnailKeys = result.hits.map((h) => h.thumbnailKey).filter((k): k is string => !!k);
    const thumbUrlByKey = await this.s3.presignGetMany('thumbs', thumbnailKeys);
    const hits: SearchAssetHitDto[] = result.hits.map((h) => ({
      id: h.id,
      slug: h.slug,
      title: h.title,
      shortDescription:
        locale === 'id' ? (h.shortDescription_id ?? '') : (h.shortDescription_en ?? ''),
      thumbnailUrl: h.thumbnailKey ? thumbUrlByKey[h.thumbnailKey] : undefined,
      engine: h.engine,
      categoryName: (locale === 'id' ? h.categoryName_id : h.categoryName_en) ?? '',
      ownerName: h.ownerDisplayName,
      totalDownloads: h.totalDownloads,
    }));
    return {
      hits,
      processingTimeMs: result.processingTimeMs,
      estimatedTotalHits: result.estimatedTotalHits,
    };
  }

  async searchTags(q: string, limit: number): Promise<TagDto[]> {
    if (!q.trim()) return [];
    const index = this.meili.client.index(MEILI_INDEX_TAGS);
    const result = await index.search<{
      id: string;
      slug: string;
      displayName: string;
      usageCount: number;
    }>(q, {
      limit: Math.min(Math.max(limit, 1), 20),
    });
    return result.hits.map((h) => ({
      id: h.id,
      slug: h.slug,
      displayName: h.displayName,
      usageCount: h.usageCount,
    }));
  }

  // ─── Indexer side ───────────────────────────────────────────────────────

  /**
   * Builds the denormalized Meilisearch document for an asset. Called by the
   * Part 3 search-index worker; we expose it here so Part 2 controllers can
   * use it for eager (synchronous) reindex when latency matters (e.g. publish).
   */
  async buildDocument(assetId: string): Promise<AssetIndexDocument | null> {
    const asset = await this.prisma.asset.findUnique({
      where: { id: assetId },
      include: {
        owner: true,
        category: true,
        translations: true,
        tags: { include: { tag: true } },
        versions: {
          include: { files: true, compatibility: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        _count: { select: { libraryItems: true, downloads: true } },
      },
    });
    if (!asset || asset.status !== 'PUBLISHED') return null;
    const latest = asset.versions[0];
    const enTranslation = asset.translations.find((t) => t.locale === 'en');
    const idTranslation = asset.translations.find((t) => t.locale === 'id');
    return {
      id: asset.id,
      slug: asset.slug,
      title: asset.title,
      shortDescription_en: enTranslation?.shortDescription,
      shortDescription_id: idTranslation?.shortDescription,
      thumbnailKey: asset.thumbnailKey ?? undefined,
      engine: asset.engine,
      categoryId: asset.categoryId,
      categoryName_en: resolveLocalized(asset.category.name as LocalizedJson, 'en') ?? undefined,
      categoryName_id: resolveLocalized(asset.category.name as LocalizedJson, 'id') ?? undefined,
      licenseId: asset.licenseId,
      tags: asset.tags.map((t) => t.tag.slug),
      renderPipelines: Array.from(
        new Set(latest?.compatibility.flatMap((c) => c.renderPipelines) ?? []),
      ),
      targets: Array.from(new Set(latest?.compatibility.flatMap((c) => c.targets) ?? [])),
      fileKinds: Array.from(new Set(latest?.files.map((f) => f.kind) ?? [])),
      ownerDisplayName: asset.owner.displayName,
      publishedAt: asset.publishedAt?.getTime() ?? 0,
      createdAt: asset.createdAt.getTime(),
      totalDownloads: asset._count.downloads,
      totalSaves: asset._count.libraryItems,
    };
  }

  // ─── Filter compiler (Meilisearch filter expression) ────────────────────

  private buildFilter(query: SearchAssetsQueryDto): string[] {
    const clauses: string[] = [];
    if (query.engine) clauses.push(`engine = "${query.engine}"`);
    if (query.licenseSlug) clauses.push(`licenseSlug = "${query.licenseSlug}"`);
    if (query.categoryIds?.length)
      clauses.push(`categoryId IN [${query.categoryIds.map((c) => `"${c}"`).join(',')}]`);
    if (query.tags?.length) clauses.push(`tags IN [${query.tags.map((t) => `"${t}"`).join(',')}]`);
    if (query.fileKinds?.length)
      clauses.push(`fileKinds IN [${query.fileKinds.map((k) => `"${k}"`).join(',')}]`);
    if (query.renderPipelines?.length)
      clauses.push(`renderPipelines IN [${query.renderPipelines.map((p) => `"${p}"`).join(',')}]`);
    if (query.targets?.length)
      clauses.push(`targets IN [${query.targets.map((t) => `"${t}"`).join(',')}]`);
    return clauses;
  }
}

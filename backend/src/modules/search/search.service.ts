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

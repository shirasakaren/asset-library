import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MeiliSearch } from 'meilisearch';
import { AppConfigService } from '../../config/app-config.service';

export const MEILI_INDEX_ASSETS = 'assets';
export const MEILI_INDEX_TAGS = 'tags';

/**
 * Meilisearch facade. Part 1 only sets up the client and idempotently ensures
 * the index configuration; indexing/search proxying lives in Part 2 inside
 * `modules/search`.
 */
@Injectable()
export class MeilisearchService implements OnModuleInit {
  private readonly logger = new Logger(MeilisearchService.name);
  public readonly client: MeiliSearch;

  constructor(config: AppConfigService) {
    this.client = new MeiliSearch({
      host: config.get('MEILI_URL'),
      apiKey: config.get('MEILI_MASTER_KEY') || undefined,
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.ensureIndexes();
    } catch (err) {
      this.logger.error('Failed to ensure Meilisearch indexes', err as Error);
    }
  }

  /**
   * Ensures the configured indexes exist with the expected searchable /
   * filterable / sortable attribute configuration. Safe to run repeatedly.
   */
  async ensureIndexes(): Promise<void> {
    await Promise.all([this.ensureAssetsIndex(), this.ensureTagsIndex()]);
  }

  private async ensureAssetsIndex(): Promise<void> {
    const index = this.client.index(MEILI_INDEX_ASSETS);
    await this.client.createIndex(MEILI_INDEX_ASSETS, { primaryKey: 'id' }).catch(() => undefined);
    await index.updateSearchableAttributes([
      'title',
      'shortDescription_en',
      'shortDescription_id',
      'tags',
      'ownerDisplayName',
    ]);
    await index.updateFilterableAttributes([
      'engine',
      'categoryId',
      'licenseId',
      'tags',
      'renderPipelines',
      'targets',
      'fileKinds',
      'status',
    ]);
    await index.updateSortableAttributes([
      'publishedAt',
      'createdAt',
      'totalDownloads',
      'totalSaves',
      'title',
    ]);
  }

  private async ensureTagsIndex(): Promise<void> {
    const index = this.client.index(MEILI_INDEX_TAGS);
    await this.client.createIndex(MEILI_INDEX_TAGS, { primaryKey: 'id' }).catch(() => undefined);
    await index.updateSearchableAttributes(['slug', 'displayName']);
    await index.updateSortableAttributes(['usageCount', 'displayName']);
  }

  // ─── Method stubs filled in by Part 2 ──────────────────────────────────────
  async indexAsset(_assetId: string): Promise<void> {
    // TODO(Part 2): denormalize Asset + translations into a Meili document.
  }

  async removeAsset(_assetId: string): Promise<void> {
    // TODO(Part 2): delete from `assets` index.
  }

  async ping(): Promise<boolean> {
    try {
      const health = await this.client.health();
      return health.status === 'available';
    } catch (err) {
      this.logger.error('Meilisearch ping failed', err as Error);
      return false;
    }
  }
}

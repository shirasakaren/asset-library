/**
 * Wipes and rebuilds the Meilisearch indexes. In Part 1 the full reindex body
 * is a TODO — we only ensure the indexes themselves exist with the configured
 * searchable / filterable / sortable attributes. Part 2 will iterate published
 * assets and push denormalized documents.
 */

import { MeiliSearch } from 'meilisearch';
import { validateEnv } from '../src/config/env.schema';

async function main(): Promise<void> {
  const env = validateEnv(process.env);
  const client = new MeiliSearch({
    host: env.MEILI_URL,
    apiKey: env.MEILI_MASTER_KEY || undefined,
  });

  // eslint-disable-next-line no-console
  console.log('[reindex] deleting existing indexes (if present)…');
  await client.deleteIndex('assets').catch(() => undefined);
  await client.deleteIndex('tags').catch(() => undefined);

  // eslint-disable-next-line no-console
  console.log('[reindex] recreating indexes…');
  await client.createIndex('assets', { primaryKey: 'id' });
  await client.createIndex('tags', { primaryKey: 'id' });

  const assets = client.index('assets');
  await assets.updateSearchableAttributes([
    'title',
    'shortDescription_en',
    'shortDescription_id',
    'tags',
    'ownerDisplayName',
  ]);
  await assets.updateFilterableAttributes([
    'engine',
    'categoryId',
    'licenseId',
    'tags',
    'renderPipelines',
    'targets',
    'fileKinds',
    'status',
  ]);
  await assets.updateSortableAttributes([
    'publishedAt',
    'createdAt',
    'totalDownloads',
    'totalSaves',
    'title',
  ]);

  const tags = client.index('tags');
  await tags.updateSearchableAttributes(['slug', 'displayName']);
  await tags.updateSortableAttributes(['usageCount', 'displayName']);

  // TODO(Part 2): fetch published assets and tags from Postgres, then
  // documents.push(...) into both indexes in batches.

  // eslint-disable-next-line no-console
  console.log('[reindex] done.');
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[reindex] failed:', err);
  process.exit(1);
});

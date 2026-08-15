/**
 * Canonical queue names. Producers (Part 2 controllers) and workers (Part 3
 * processors) must use the same identifiers so jobs route correctly. New
 * names append-only — never rename existing ones.
 */
export const QUEUE = {
  ANALYZE: 'analyze',
  ANALYZE_VERSION: 'analyze-version',
  GLTF_CONVERT: 'gltf-convert',
  THUMBNAIL_VARIANTS: 'thumbnail-variants',
  THUMBNAIL_RENDER: 'thumbnail-render',
  SEARCH_INDEX: 'search-index',
  SEARCH_INDEX_BATCH: 'search-index-batch',
  NOTIFY: 'notify',
  WEBHOOK: 'webhook',
  ARCHIVE_PURGE: 'archive-purge',
  AUDIT_PURGE: 'audit-purge',
  EDITOR_MEDIA_GC: 'editor-media-gc',
  ANALYTICS_ROLLUP: 'analytics-rollup',
  STORAGE_ROLLUP: 'storage-rollup',
} as const;

export type QueueName = (typeof QUEUE)[keyof typeof QUEUE];

/** Concurrency caps per queue (Part 3 §2.1). */
export const QUEUE_CONCURRENCY: Record<QueueName, number> = {
  [QUEUE.ANALYZE]: 2,
  [QUEUE.ANALYZE_VERSION]: 2,
  [QUEUE.GLTF_CONVERT]: 2,
  [QUEUE.THUMBNAIL_VARIANTS]: 4,
  [QUEUE.THUMBNAIL_RENDER]: 2,
  [QUEUE.SEARCH_INDEX]: 4,
  [QUEUE.SEARCH_INDEX_BATCH]: 1,
  [QUEUE.NOTIFY]: 8,
  [QUEUE.WEBHOOK]: 2,
  [QUEUE.ARCHIVE_PURGE]: 1,
  [QUEUE.AUDIT_PURGE]: 1,
  [QUEUE.EDITOR_MEDIA_GC]: 1,
  [QUEUE.ANALYTICS_ROLLUP]: 1,
  [QUEUE.STORAGE_ROLLUP]: 1,
};

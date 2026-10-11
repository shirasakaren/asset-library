import { adminRoute } from './common';

/** The backend's queue names (`queue-names.ts`), in declaration order. */
export const QUEUE_NAMES = [
  'analyze',
  'analyze-version',
  'gltf-convert',
  'thumbnail-variants',
  'thumbnail-render',
  'search-index',
  'search-index-batch',
  'notify',
  'webhook',
  'archive-purge',
  'audit-purge',
  'editor-media-gc',
  'analytics-rollup',
  'storage-rollup',
] as const;

/**
 * `/admin/queues` is the BullBoard UI in the real stack and no screen of this app calls it (the
 * sidebar does not link it). The demo has no job queues, so this answers with the queue names and
 * zero counts, which is what an idle system looks like.
 */
adminRoute('GET', '/admin/queues', () => ({
  enabled: true,
  queues: QUEUE_NAMES.map((name) => ({
    name,
    counts: { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 },
  })),
}));

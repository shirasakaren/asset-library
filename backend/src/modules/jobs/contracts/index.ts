/**
 * Typed contracts for every BullMQ queue. Producers and processors import
 * from here; the wire format is part of the system contract — DO NOT
 * silently change existing fields.
 */

export interface AnalyzeFileJob {
  versionId: string;
  fileId: string;
  /** Hint from the upload-complete callback; analyzer treats it as advisory. */
  kindHint?: string;
}

export interface AnalyzeVersionJob {
  versionId: string;
  /**
   * Triggered by the file-level fan-in (Redis counter hits zero) OR by an
   * explicit POST /assets/:id/versions/:vid/reanalyze.
   */
  reason: 'fan-in' | 'reanalyze';
}

export interface GltfConvertJob {
  versionId: string;
  fileId: string;
  sourceKey: string;
  sourceKind: 'FBX' | 'OBJ' | 'BLEND' | 'GLTF';
}

export interface ThumbnailVariantsJob {
  assetId: string;
  sourceKey: string;
}

export interface ThumbnailRenderJob {
  versionId: string;
  glbKey: string;
}

export type SearchIndexReason =
  | 'asset.publish'
  | 'asset.update'
  | 'asset.archive'
  | 'asset.restore'
  | 'asset.delete'
  | 'asset.stats';

export interface SearchIndexJob {
  assetId: string;
  reason: SearchIndexReason;
}

/** Batch trigger — payload is empty because the worker reads from Redis SET. */
export interface SearchIndexBatchJob {
  triggeredAt: string;
}

export interface NotifyJob {
  recipientUserId: string;
  /** Stable event identifier — see Part 3 §8.1. */
  type: import('@prisma/client').NotificationType;
  /** Typed per-event payload (see notifications/payloads/*). */
  payload: Record<string, unknown>;
  /**
   * Channels to fan out on. Defaults to every channel; setting `dropChannels`
   * lets internal events skip email or webhook.
   */
  dropChannels?: Array<'inApp' | 'ws' | 'email' | 'webhook'>;
  actor?: { id: string; email?: string; displayName?: string };
}

export interface WebhookDeliveryJob {
  event: string;
  recipient?: { id: string; email?: string };
  actor?: { id: string; email?: string; displayName?: string };
  payload: Record<string, unknown>;
}

export interface ArchivePurgeJob {
  triggeredAt: string;
}

export interface AuditPurgeJob {
  triggeredAt: string;
}

export interface EditorMediaGcJob {
  triggeredAt: string;
}

export interface AnalyticsRollupJob {
  triggeredAt: string;
}

export interface WsFanoutMessage {
  userId: string;
  type: string;
  id: string;
  ts: number;
  payload: unknown;
}

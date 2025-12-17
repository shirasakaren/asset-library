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

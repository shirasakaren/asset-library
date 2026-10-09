import type { AssetRecord } from '../records';
import type { PreviewContext } from '../router/router';
import type { Db } from '../types';
import { serialized } from './write-queue';

/** How long the simulated analyzer takes (the real one is a background job). */
export const SCHEDULED_ANALYSIS_MS = 2000;

const pending = new WeakMap<Db, Set<string>>();

/**
 * STUB for the real analyzer + AV worker: after 2 s a version whose analysis is `PENDING` or
 * `ANALYZING` becomes `READY` and `{ type: 'version.ready', assetId, versionId }` goes on the
 * bus (the wizard and the asset page refetch on it). No notification is created: the real API
 * only sends `ANALYZER_FAILED`, which the demo never simulates.
 *
 * Returns `true` when a timer was scheduled; `false` when `ctx.timers` is off (tests) or one is
 * already pending for that version (so several uploads in a row share a single timer). Whether the
 * version still needs analysing is decided when the timer fires, so deleting the asset or
 * resetting the demo in between is harmless. Used by `reanalyze` and by `attachFileToVersion`
 * (the upload `complete` handler gets it for free).
 */
export function scheduleAnalysis(ctx: PreviewContext, assetId: string, versionId: string): boolean {
  if (!ctx.timers) return false;
  let keys = pending.get(ctx.db);
  if (!keys) {
    keys = new Set();
    pending.set(ctx.db, keys);
  }
  const key = `${assetId}/${versionId}`;
  if (keys.has(key)) return false;
  keys.add(key);
  const owner = keys;
  setTimeout(() => {
    owner.delete(key);
    void finishAnalysis(ctx, assetId, versionId).catch((err) => {
      console.error('[preview] analysis failed', assetId, versionId, err);
    });
  }, SCHEDULED_ANALYSIS_MS);
  return true;
}

function finishAnalysis(ctx: PreviewContext, assetId: string, versionId: string): Promise<void> {
  return serialized(async () => {
    const asset = await ctx.db.get<AssetRecord>('assets', assetId);
    if (!asset || asset.status === 'DELETED') return;
    const version = asset.versions.find((v) => v.id === versionId);
    if (
      !version ||
      (version.analysisStatus !== 'PENDING' && version.analysisStatus !== 'ANALYZING')
    ) {
      return;
    }
    await ctx.db.patch<AssetRecord>('assets', assetId, {
      versions: asset.versions.map((v) =>
        v.id === versionId ? { ...v, analysisStatus: 'READY' as const } : v,
      ),
    });
    ctx.emit({ type: 'version.ready', assetId, versionId });
  });
}

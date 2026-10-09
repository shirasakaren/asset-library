import type { AssetVersionRecord } from '../records';
import { newestCreated } from './publish-checklist';

/** Numeric MAJOR.MINOR.PATCH comparison (a pre-release suffix is ignored). Negative when `a < b`. */
export function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length, 3); i += 1) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/**
 * The version the wizard edits (`semver`, `requiresEmptyProject` of `PATCH /assets/{id}`): the
 * `isLatest` one, else the most recently created (the backend orders `isLatest desc, createdAt desc`).
 */
export function wizardVersion(versions: AssetVersionRecord[]): AssetVersionRecord | undefined {
  return versions.find((v) => v.isLatest) ?? newestCreated(versions);
}

/**
 * Recomputes `bytesTotal` (decimal string, sum of the file sizes) and `fileCount` from `files`.
 * Mutates and returns the version, so callers can use it inline.
 */
export function recomputeVersionTotals<T extends AssetVersionRecord>(version: T): T {
  let total = 0n;
  for (const f of version.files) {
    try {
      total += BigInt(f.bytes);
    } catch {
      // A malformed size counts as 0 rather than breaking the whole version.
    }
  }
  version.bytesTotal = total.toString();
  version.fileCount = version.files.length;
  return version;
}

/**
 * Publishes one version: it becomes the single `isLatest` row (every other row is flipped off in
 * the same array, so the invariant holds after every write) and gets `publishedAt` when it had
 * none. Returns a new array; the input is not modified.
 */
export function markLatest(
  versions: AssetVersionRecord[],
  versionId: string,
  nowIso: string,
): AssetVersionRecord[] {
  return versions.map((v) =>
    v.id === versionId
      ? { ...v, isLatest: true, publishedAt: v.publishedAt ?? nowIso }
      : v.isLatest
        ? { ...v, isLatest: false }
        : v,
  );
}

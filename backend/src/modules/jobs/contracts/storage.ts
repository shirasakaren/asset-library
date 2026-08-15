/**
 * Storage rollup job payload. Triggered by a daily repeatable schedule. Walks
 * every configured S3 bucket and writes `StorageDaily` / `StorageUserDaily`
 * / `StorageAssetDaily` snapshots.
 */
export interface StorageRollupJob {
  triggeredAt: string;
}

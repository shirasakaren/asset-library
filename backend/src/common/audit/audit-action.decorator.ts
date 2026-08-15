import { SetMetadata } from '@nestjs/common';

export const AUDIT_ACTION_KEY = 'audit:action';
export const AUDIT_SUBJECT_PARAM_KEY = 'audit:subjectParam';

export interface AuditActionConfig {
  /** Stable verb.subject id stored in `AuditLog.action`. Append-only. */
  action: string;
  /** Logical resource type (e.g. 'Asset', 'Report'). */
  subjectType: string;
  /**
   * Name of the controller param that carries the subject id. Defaults to
   * `'id'` (the canonical route param). When the id lives on the request
   * body, set this to e.g. `'body.assetId'` — the interceptor resolves it.
   */
  subjectParam?: string;
}

/**
 * Declarative audit marker. The interceptor persists an `AuditLog` row
 * *after* the handler returns successfully (failures are not audited — the
 * exception filter + Sentry are the audit trail for those).
 *
 * Example:
 *   @AuditAction({ action: 'featured.create', subjectType: 'FeaturedSlot' })
 *   create(...)
 */
export const AuditAction = (config: AuditActionConfig) => SetMetadata(AUDIT_ACTION_KEY, config);

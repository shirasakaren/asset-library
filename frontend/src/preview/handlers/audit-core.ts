import type { AuditRecord } from '../records';
import type { PreviewContext } from '../router/router';

export interface AuditInput {
  /** Backend action name, e.g. `me.revoke_device`, `report.dismiss`. */
  action: string;
  /** `Asset`, `User`, `Tag`, `Category`, `License`, `FeaturedSlot`, `Report`, `AssetRequest`, `Device`. */
  subjectType: string;
  subjectId: string;
  metadata?: Record<string, unknown> | null;
  /** Defaults to the persona; `null` is a system job. */
  actorId?: string | null;
}

/**
 * Appends one audit-log row (`GET /admin/audit`), like the backend's `AuditService.record`.
 * Call it only for actions the backend audits (the `@AuditAction` handlers and explicit
 * `audit.record` calls), after the change has been applied.
 */
export function recordAudit(ctx: PreviewContext, input: AuditInput): Promise<AuditRecord> {
  return ctx.db.put<AuditRecord>('audit', {
    id: ctx.newId('au'),
    action: input.action,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    actorId: input.actorId === undefined ? ctx.meId : input.actorId,
    metadata: input.metadata ?? null,
    createdAt: ctx.now().toISOString(),
  });
}

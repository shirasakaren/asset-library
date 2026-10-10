import type { AuditEntry } from '@/lib/api/admin-types';
import type { AuditRecord, UserRecord } from '../../records';
import { cmpStr } from './common';

/** Newest first, `id` descending as the tiebreak (the backend's `createdAt desc, id desc`). */
export const auditNewestFirst = (a: AuditRecord, b: AuditRecord): number =>
  cmpStr(b.createdAt, a.createdAt) || cmpStr(b.id, a.id);

/** `AuditEntry`: the stored row with the actor's name and email filled in (null = system job). */
export function toAuditEntry(
  row: AuditRecord,
  users: ReadonlyMap<string, Pick<UserRecord, 'displayName' | 'email'>>,
): AuditEntry {
  const actor = row.actorId ? users.get(row.actorId) : undefined;
  return {
    id: row.id,
    action: row.action,
    subjectType: row.subjectType,
    subjectId: row.subjectId,
    actorId: row.actorId,
    actorDisplayName: actor?.displayName ?? null,
    actorEmail: actor?.email ?? null,
    metadata: row.metadata,
    createdAt: row.createdAt,
  };
}

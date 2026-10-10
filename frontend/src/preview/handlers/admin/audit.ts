import type { AdminAuditPage, AuditEntry } from '@/lib/api/admin-types';
import type { AuditRecord, UserRecord } from '../../records';
import { badRequest, notFound } from '../../router/errors';
import { paginate } from '../../router/paginate';
import { adminRoute } from './common';
import { auditNewestFirst, toAuditEntry } from './audit-view';

/** `from` / `to` as the backend validates them (`@IsISO8601`); a date-time without a zone is local time. */
function instantParam(query: URLSearchParams, name: 'from' | 'to'): string | undefined {
  const raw = (query.get(name) ?? '').trim();
  if (!raw) return undefined;
  const ms = Date.parse(raw);
  if (!/^\d{4}-\d{2}-\d{2}/.test(raw) || Number.isNaN(ms)) {
    throw badRequest(`${name} must be an ISO-8601 date.`, {
      fields: [{ path: name, code: 'invalid', message: `${name} must be an ISO-8601 date.` }],
    });
  }
  return new Date(ms).toISOString();
}

/**
 * Audit log, newest first (`createdAt desc, id desc`, so the order is total and the cursor walk
 * never repeats or skips a row). Filters `actorId`, `action`, `subjectType`, `subjectId` are exact
 * matches; `from` / `to` bound `createdAt` inclusively. Rows the handlers append (`recordAudit`)
 * are in the same collection as the seeded ones and carry the same columns.
 */
adminRoute('GET', '/admin/audit', async (req, ctx): Promise<AdminAuditPage> => {
  const q = req.query;
  const actorId = q.get('actorId') || undefined;
  const action = q.get('action') || undefined;
  const subjectType = q.get('subjectType') || undefined;
  const subjectId = q.get('subjectId') || undefined;
  const from = instantParam(q, 'from');
  const to = instantParam(q, 'to');

  const [rows, users] = await Promise.all([
    ctx.db.list<AuditRecord>('audit'),
    ctx.db.list<UserRecord>('users'),
  ]);
  const matching = rows
    .filter(
      (r) =>
        (!actorId || r.actorId === actorId) &&
        (!action || r.action === action) &&
        (!subjectType || r.subjectType === subjectType) &&
        (!subjectId || r.subjectId === subjectId) &&
        (!from || r.createdAt >= from) &&
        (!to || r.createdAt <= to),
    )
    .sort(auditNewestFirst);
  const page = paginate(matching, q);
  const byId = new Map(users.map((u) => [u.id, u]));
  return { items: page.items.map((r) => toAuditEntry(r, byId)), pageInfo: page.pageInfo };
});

adminRoute('GET', '/admin/audit/{id}', async (req, ctx): Promise<AuditEntry> => {
  const id = req.params.id!;
  const row = await ctx.db.get<AuditRecord>('audit', id);
  if (!row) throw notFound(`Audit entry ${id} not found.`, { code: 'audit.not_found' });
  const users = await ctx.db.list<UserRecord>('users');
  return toAuditEntry(row, new Map(users.map((u) => [u.id, u])));
});

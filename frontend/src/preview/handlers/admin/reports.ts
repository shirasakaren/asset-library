import type {
  AdminReport,
  AdminReportPage,
  ReportAction,
  ReportCategory,
  ReportStatus,
} from '@/lib/api/admin-types';
import type { AssetRecord, ReportRecord, UserRecord } from '../../records';
import { badRequest, conflict, notFound } from '../../router/errors';
import type { PreviewContext } from '../../router/router';
import { paginate } from '../../router/paginate';
import { REPORT_CATEGORIES } from '../reports';
import { archiveAsset, softDeleteAsset } from '../asset-lifecycle';
import { recordAudit } from '../audit-core';
import { serialized } from '../write-queue';
import { purgeAsset } from './assets-danger';
import { adminRoute, cmpStr, requireConfirmation } from './common';
import { asBody, Problems, readString } from './input';

const STATUSES: readonly ReportStatus[] = ['OPEN', 'REVIEWING', 'ACTIONED', 'DISMISSED'];
const ACTIONS: readonly ReportAction[] = [
  'NOTHING',
  'ARCHIVE_ASSET',
  'DELETE_ASSET',
  'FORCE_DELETE_ASSET',
];
const NOTES_MIN = 4;
const NOTES_MAX = 1000;

/** What the row shows when the reported asset no longer exists (force-deleted). */
export const DELETED_ASSET_TITLE = '(deleted asset)';
const UNKNOWN_USER = '(unknown)';

const reportNotFound = (id: string) =>
  notFound(`Report ${id} not found.`, { code: 'report.not_found' });

const invalidTransition = (r: ReportRecord, what: string) =>
  conflict(`Report ${r.id} is ${r.status}; ${what}.`, { code: 'report.invalid_transition' });

/**
 * `AdminReport`: the stored report plus the asset's title and slug and the reporter's name and
 * email. A report whose asset was force-deleted (the backend's FK would forbid it, the demo does
 * not) shows `(deleted asset)` and an empty slug; an unknown reporter shows `(unknown)`.
 */
export function toAdminReport(
  r: ReportRecord,
  assets: ReadonlyMap<string, Pick<AssetRecord, 'title' | 'slug'>>,
  users: ReadonlyMap<string, Pick<UserRecord, 'displayName' | 'email'>>,
): AdminReport {
  const asset = assets.get(r.assetId);
  const reporter = users.get(r.reporterId);
  return {
    id: r.id,
    category: r.category,
    notes: r.notes,
    status: r.status,
    assetId: r.assetId,
    assetTitle: asset?.title ?? DELETED_ASSET_TITLE,
    assetSlug: asset?.slug ?? '',
    reporter: {
      id: r.reporterId,
      displayName: reporter?.displayName ?? UNKNOWN_USER,
      email: reporter?.email ?? null,
    },
    adminNotes: r.adminNotes,
    createdAt: r.createdAt,
    resolvedAt: r.resolvedAt,
  };
}

const newestFirst = (a: ReportRecord, b: ReportRecord) =>
  cmpStr(b.createdAt, a.createdAt) || cmpStr(b.id, a.id);

async function loadMaps(ctx: PreviewContext) {
  const [assets, users] = await Promise.all([
    ctx.db.list<AssetRecord>('assets'),
    ctx.db.list<UserRecord>('users'),
  ]);
  return {
    assets: new Map(assets.map((a) => [a.id, a])),
    users: new Map(users.map((u) => [u.id, u])),
  };
}

/** Moderation queue: `status` and `category` filters, newest first, cursor pages (the page sends 50). */
adminRoute('GET', '/admin/reports', async (req, ctx): Promise<AdminReportPage> => {
  const status = req.query.get('status');
  const category = req.query.get('category');
  if (status && !(STATUSES as readonly string[]).includes(status)) {
    throw badRequest(`Unknown status "${status}". Expected one of ${STATUSES.join(', ')}.`);
  }
  if (category && !(REPORT_CATEGORIES as readonly string[]).includes(category)) {
    throw badRequest(
      `Unknown category "${category}". Expected one of ${REPORT_CATEGORIES.join(', ')}.`,
    );
  }
  const [rows, maps] = await Promise.all([ctx.db.list<ReportRecord>('reports'), loadMaps(ctx)]);
  const matching = rows
    .filter(
      (r) =>
        (!status || r.status === status) &&
        (!category || r.category === (category as ReportCategory)),
    )
    .sort(newestFirst);
  const page = paginate(matching, req.query);
  return {
    items: page.items.map((r) => toAdminReport(r, maps.assets, maps.users)),
    pageInfo: page.pageInfo,
  };
});

adminRoute('GET', '/admin/reports/{id}', async (req, ctx): Promise<AdminReport> => {
  const id = req.params.id!;
  const row = await ctx.db.get<ReportRecord>('reports', id);
  if (!row) throw reportNotFound(id);
  const maps = await loadMaps(ctx);
  return toAdminReport(row, maps.assets, maps.users);
});

/** OPEN to REVIEWING (any other status is a 409). Audit `report.start_review { assetId }`. */
adminRoute('POST', '/admin/reports/{id}/start-review', (req, ctx) =>
  serialized(async () => {
    const id = req.params.id!;
    const row = await ctx.db.get<ReportRecord>('reports', id);
    if (!row) throw reportNotFound(id);
    if (row.status !== 'OPEN') throw invalidTransition(row, 'only an OPEN report can start review');
    await ctx.db.patch<ReportRecord>('reports', id, { status: 'REVIEWING' });
    await recordAudit(ctx, {
      action: 'report.start_review',
      subjectType: 'Report',
      subjectId: id,
      metadata: { assetId: row.assetId },
    });
    return undefined;
  }),
);

/**
 * Applies the decision to the reported asset, through the same helpers as the admin asset routes
 * (and with their audit rows, reason `report:<id> - <notes>`). `NOTHING` touches nothing. An asset
 * that is already archived or soft-deleted satisfies archive/delete; one that is gone is a 404
 * (`FORCE_DELETE_ASSET` of an asset that is already gone is fine). Throws BEFORE anything is
 * written when the effect is not possible, so the report stays as it was.
 */
async function applyAssetEffect(
  ctx: PreviewContext,
  report: ReportRecord,
  action: ReportAction,
  notes: string,
): Promise<void> {
  if (action === 'NOTHING') return;
  const asset = await ctx.db.get<AssetRecord>('assets', report.assetId);
  if (!asset) {
    if (action === 'FORCE_DELETE_ASSET') return;
    throw notFound(`Asset ${report.assetId} not found.`, { code: 'asset.not_found' });
  }
  const reason = `report:${report.id} - ${notes.slice(0, 200)}`;
  const previousStatus = asset.status;
  if (action === 'ARCHIVE_ASSET') {
    if (previousStatus === 'ARCHIVED') return;
    await archiveAsset(ctx, asset);
    await recordAudit(ctx, {
      action: 'asset.admin_archive',
      subjectType: 'Asset',
      subjectId: asset.id,
      metadata: { previousStatus, reason },
    });
  } else if (action === 'DELETE_ASSET') {
    if (previousStatus === 'DELETED') return;
    await softDeleteAsset(ctx, asset);
    await recordAudit(ctx, {
      action: 'asset.admin_delete',
      subjectType: 'Asset',
      subjectId: asset.id,
      metadata: { previousStatus, reason },
    });
  } else {
    await purgeAsset(ctx, asset);
    await recordAudit(ctx, {
      action: 'asset.force_delete',
      subjectType: 'Asset',
      subjectId: asset.id,
      metadata: { reason, previousStatus, ownerId: asset.ownerId },
    });
    ctx.emit({ type: 'assets.changed' });
  }
}

/**
 * The decision form: `{ adminNotes (4..1000), action, confirm?, confirmedAt? }`. The asset effect
 * runs first; only when it succeeds is the report resolved (`ACTIONED`, `action`, `adminNotes`,
 * `resolvedById`, `resolvedAt`), so a failed effect leaves the report as it was. `FORCE_DELETE_ASSET`
 * needs the confirmation fields (400 `confirmation.required` / `confirmation.expired`). A report
 * that is already ACTIONED or DISMISSED is a 409 (the backend would resolve it again). Audit
 * `report.action { action, assetId }`. No notification: the backend only fans out when a report is
 * created.
 */
adminRoute('POST', '/admin/reports/{id}/action', (req, ctx, admin) => {
  const body = asBody(req.body);
  const problems = new Problems();
  const adminNotes = readString(body, 'adminNotes', problems, {
    required: true,
    min: NOTES_MIN,
    max: NOTES_MAX,
  });
  if (!(ACTIONS as readonly unknown[]).includes(body.action)) {
    problems.add('action', 'invalid', `action must be one of ${ACTIONS.join(', ')}.`);
  }
  problems.check('Invalid report decision.');
  const action = body.action as ReportAction;
  return serialized(async () => {
    const id = req.params.id!;
    const row = await ctx.db.get<ReportRecord>('reports', id);
    if (!row) throw reportNotFound(id);
    if (action === 'FORCE_DELETE_ASSET') requireConfirmation(ctx, req.body);
    if (row.status === 'ACTIONED' || row.status === 'DISMISSED') {
      throw invalidTransition(row, 'it is already resolved');
    }
    await applyAssetEffect(ctx, row, action, adminNotes!);
    await ctx.db.patch<ReportRecord>('reports', id, {
      status: 'ACTIONED',
      action,
      adminNotes: adminNotes!,
      resolvedById: admin.id,
      resolvedAt: ctx.now().toISOString(),
    });
    await recordAudit(ctx, {
      action: 'report.action',
      subjectType: 'Report',
      subjectId: id,
      metadata: { action, assetId: row.assetId },
    });
    return undefined;
  });
});

/** Dismiss with notes (4..1000): DISMISSED, `adminNotes`, `resolvedById`, `resolvedAt`. */
adminRoute('POST', '/admin/reports/{id}/dismiss', (req, ctx, admin) => {
  const problems = new Problems();
  const adminNotes = readString(asBody(req.body), 'adminNotes', problems, {
    required: true,
    min: NOTES_MIN,
    max: NOTES_MAX,
  });
  problems.check('Invalid dismissal.');
  return serialized(async () => {
    const id = req.params.id!;
    const row = await ctx.db.get<ReportRecord>('reports', id);
    if (!row) throw reportNotFound(id);
    if (row.status === 'ACTIONED' || row.status === 'DISMISSED') {
      throw invalidTransition(row, 'it is already resolved');
    }
    await ctx.db.patch<ReportRecord>('reports', id, {
      status: 'DISMISSED',
      adminNotes: adminNotes!,
      resolvedById: admin.id,
      resolvedAt: ctx.now().toISOString(),
    });
    await recordAudit(ctx, {
      action: 'report.dismiss',
      subjectType: 'Report',
      subjectId: id,
      metadata: { assetId: row.assetId },
    });
    return undefined;
  });
});

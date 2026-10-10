import type { NotificationType } from '@/lib/api/types';
import type { ReportCategory } from '@/lib/api/admin-types';
import type { AssetRecord, ReportRecord, UserRecord } from '../records';
import type { PreviewContext } from '../router/router';
import { route } from '../router/router';
import { badRequest, notFound } from '../router/errors';
import { findAsset, getMe, visibleTo } from './helpers';
import { createNotification } from './notifications';

export const REPORT_CATEGORIES: readonly ReportCategory[] = ['MALICIOUS_FILE', 'BROKEN_ASSET'];
const MIN_NOTES = 4;
const MAX_NOTES = 1000;

interface FieldProblem {
  path: string;
  code: string;
  message: string;
}

/**
 * Body of `POST /reports`, validated like the backend DTO: `assetId` string, `category` enum,
 * `notes` 4..1000 characters (the report modal asks for 10+; the API allows 4). Every problem is
 * reported at once, as `fields`.
 */
export function parseCreateReport(raw: unknown): {
  assetId: string;
  category: ReportCategory;
  notes: string;
} {
  const body =
    typeof raw === 'object' && raw !== null && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const problems: FieldProblem[] = [];
  const bad = (path: string, code: string, message: string) =>
    problems.push({ path, code, message });

  const assetId = body.assetId;
  if (typeof assetId !== 'string' || !assetId.trim()) {
    bad('assetId', 'required', 'assetId must be a non-empty string.');
  }
  const category = body.category;
  if (!(REPORT_CATEGORIES as readonly unknown[]).includes(category)) {
    bad('category', 'invalid', `category must be one of ${REPORT_CATEGORIES.join(', ')}.`);
  }
  const notes = typeof body.notes === 'string' ? body.notes.trim() : undefined;
  if (notes === undefined) {
    bad('notes', 'required', 'notes must be a string.');
  } else if (notes.length < MIN_NOTES) {
    bad('notes', 'too_short', `notes must be at least ${MIN_NOTES} characters.`);
  } else if (notes.length > MAX_NOTES) {
    bad('notes', 'too_long', `notes must be at most ${MAX_NOTES} characters.`);
  }

  if (problems.length > 0) throw badRequest('Invalid report.', { fields: problems });
  return {
    assetId: (assetId as string).trim(),
    category: category as ReportCategory,
    notes: notes!,
  };
}

/**
 * Inbox side of a new report, like the backend fan-out: the asset's owner gets
 * `REPORT_RECEIVED_FOR_YOUR_ASSET` (unless they reported it) and every admin gets
 * `REPORT_CREATED`. Only the persona has an inbox, so each is created only when the persona is
 * that recipient AND is not the reporter (the persona reporting in the UI is never notified about
 * their own report). Used for simulations and tests. Payload keys follow the seed. Returns the
 * ids of the notifications created.
 */
export async function notifyPersonaOfReport(
  ctx: PreviewContext,
  args: {
    report: Pick<ReportRecord, 'id' | 'category' | 'reporterId'>;
    asset: Pick<AssetRecord, 'id' | 'slug' | 'title' | 'ownerId'>;
    reporter: Pick<UserRecord, 'id' | 'displayName'>;
  },
): Promise<string[]> {
  const { report, asset, reporter } = args;
  if (report.reporterId === ctx.meId || reporter.id === ctx.meId) return [];
  const payload = {
    reportId: report.id,
    assetId: asset.id,
    assetSlug: asset.slug,
    assetTitle: asset.title,
    category: report.category,
  };
  const types: Array<[NotificationType, Record<string, unknown>]> = [];
  if (asset.ownerId === ctx.meId) types.push(['REPORT_RECEIVED_FOR_YOUR_ASSET', payload]);
  if ((await getMe(ctx)).isAdmin) {
    types.push(['REPORT_CREATED', { ...payload, reporterName: reporter.displayName }]);
  }
  const ids: string[] = [];
  for (const [type, p] of types) ids.push((await createNotification(ctx, type, p)).id);
  return ids;
}

/**
 * Submit a report. Unlike the backend (any existing asset), the asset must also be visible to the
 * reporter; there is no duplicate rule in the backend, so none here (the rate limit is not simulated).
 */
route('POST', '/reports', async (req, ctx): Promise<{ id: string }> => {
  const input = parseCreateReport(req.body);
  const [viewer, assets] = await Promise.all([getMe(ctx), ctx.db.list<AssetRecord>('assets')]);
  const asset = findAsset(assets, input.assetId);
  if (!asset || !visibleTo(asset, viewer.id, viewer.isAdmin)) {
    throw notFound(`Asset ${input.assetId} not found.`, { code: 'asset.not_found' });
  }
  const record = await ctx.db.put<ReportRecord>('reports', {
    id: ctx.newId('rep'),
    category: input.category,
    notes: input.notes,
    status: 'OPEN',
    assetId: asset.id,
    reporterId: viewer.id,
    adminNotes: null,
    action: null,
    resolvedById: null,
    createdAt: ctx.now().toISOString(),
    resolvedAt: null,
  });
  await notifyPersonaOfReport(ctx, {
    report: record,
    asset,
    reporter: { id: viewer.id, displayName: viewer.user?.displayName ?? '' },
  });
  return { id: record.id };
});

import type { AdminAssetRequestPage } from '@/lib/api/admin-types';
import type { AssetRequest, AssetRequestStatus } from '@/lib/api/types';
import type { RequestRecord, UserRecord } from '../../records';
import { badRequest, notFound } from '../../router/errors';
import type { PreviewContext } from '../../router/router';
import { paginate } from '../../router/paginate';
import { recordAudit } from '../audit-core';
import { createNotification } from '../notifications';
import { newestRequestFirst, REQUEST_STATUSES, toAssetRequest } from '../requests';
import { serialized } from '../write-queue';
import { adminRoute } from './common';
import { asBody, Problems, readString } from './input';

/** The statuses an admin can set (`AdminUpdateAssetRequestDto`): everything but `SENT`. */
const REVIEW_STATUSES: readonly AssetRequestStatus[] = [
  'IN_REVIEW',
  'PENDING',
  'APPROVED',
  'REJECTED',
];
const COMMENT_MAX = 2000;

const requestNotFound = (id: string) =>
  notFound(`Request ${id} not found.`, { code: 'request.not_found' });

const usersById = async (ctx: PreviewContext) =>
  new Map((await ctx.db.list<UserRecord>('users')).map((u) => [u.id, u]));

/**
 * Every requester's requests (the admin queue): `status` and `requesterId` filters, newest first
 * with the `id` tiebreak, cursor pages (the page sends `limit: 50`). Same payload as the user
 * routes (`toAssetRequest`).
 */
adminRoute('GET', '/admin/asset-requests', async (req, ctx): Promise<AdminAssetRequestPage> => {
  const statusParam = req.query.get('status');
  if (statusParam && !(REQUEST_STATUSES as readonly string[]).includes(statusParam)) {
    throw badRequest(
      `Unknown status "${statusParam}". Expected one of ${REQUEST_STATUSES.join(', ')}.`,
    );
  }
  const requesterId = req.query.get('requesterId');
  const [rows, users] = await Promise.all([ctx.db.list<RequestRecord>('requests'), usersById(ctx)]);
  const matching = rows
    .filter(
      (r) =>
        (!statusParam || r.status === statusParam) &&
        (!requesterId || r.requesterId === requesterId),
    )
    .sort(newestRequestFirst);
  const page = paginate(matching, req.query);
  return { items: page.items.map((r) => toAssetRequest(r, users)), pageInfo: page.pageInfo };
});

adminRoute('GET', '/admin/asset-requests/{id}', async (req, ctx): Promise<AssetRequest> => {
  const id = req.params.id!;
  const row = await ctx.db.get<RequestRecord>('requests', id);
  if (!row) throw requestNotFound(id);
  return toAssetRequest(row, await usersById(ctx));
});

/**
 * The decision form: `{ status, adminComment? }`.
 *  - `status` is one of IN_REVIEW, PENDING, APPROVED, REJECTED (never back to SENT). Like the
 *    backend there is no state machine: any of them can follow any status.
 *  - REJECTED needs a non-blank `adminComment` in the same request (400 with `fields`).
 *  - `adminComment` <= 2000 characters; a blank or missing one keeps the stored comment (the
 *    form sends `undefined` when empty, so a comment can be replaced but not cleared).
 *  - Stamps `reviewedById` and `updatedAt`.
 * The requester gets `REQUEST_STATUS_CHANGED` (as in the backend, which always notifies the
 * requester, even when the reviewer is that same person); only the persona has an inbox, so one is
 * created only when she is the requester. Audit `asset_request.status_change { from, to,
 * adminComment? }`. Returns the updated `AssetRequest`.
 */
adminRoute('PATCH', '/admin/asset-requests/{id}', (req, ctx, admin) => {
  const body = asBody(req.body);
  const problems = new Problems();
  const next = body.status;
  if (!(REVIEW_STATUSES as readonly unknown[]).includes(next)) {
    problems.add('status', 'invalid', `status must be one of ${REVIEW_STATUSES.join(', ')}.`);
  }
  const comment = readString(body, 'adminComment', problems, { max: COMMENT_MAX });
  if (next === 'REJECTED' && !comment && !problems.list.some((p) => p.path === 'adminComment')) {
    problems.add(
      'adminComment',
      'required',
      'Rejecting requires a non-empty adminComment so the requester understands why.',
    );
  }
  problems.check('Invalid request decision.');
  const status = next as AssetRequestStatus;

  return serialized(async () => {
    const id = req.params.id!;
    const row = await ctx.db.get<RequestRecord>('requests', id);
    if (!row) throw requestNotFound(id);
    const adminComment = comment || row.adminComment || null;
    const updated = await ctx.db.patch<RequestRecord>('requests', id, {
      status,
      adminComment,
      reviewedById: admin.id,
      updatedAt: ctx.now().toISOString(),
    });
    if (row.requesterId === ctx.meId) {
      await createNotification(ctx, 'REQUEST_STATUS_CHANGED', {
        requestId: id,
        status,
        newStatus: status,
        adminComment: adminComment ?? '',
        byAdminName: admin.user?.displayName ?? '',
      });
    }
    await recordAudit(ctx, {
      action: 'asset_request.status_change',
      subjectType: 'AssetRequest',
      subjectId: id,
      metadata: comment
        ? { from: row.status, to: status, adminComment: comment }
        : { from: row.status, to: status },
    });
    return toAssetRequest(updated, await usersById(ctx));
  });
});

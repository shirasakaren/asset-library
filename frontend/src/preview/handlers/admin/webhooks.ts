import type { AdminWebhookPage } from '@/lib/api/admin-types';
import type { WebhookDeliveryRecord } from '../../records';
import { badRequest } from '../../router/errors';
import { paginate } from '../../router/paginate';
import { adminRoute, cmpStr } from './common';

const STATUSES = ['success', 'failure', 'pending'] as const;
const DEFAULT_LIMIT = 50;

/**
 * n8n webhook delivery attempts, newest first (`id` descending as the tiebreak), cursor pages of
 * 50 by default (the page sends `limit: 50`; the cursor pager caps a page at 100, the backend at
 * 200). `status` is `success`, `failure` or `pending` (400 otherwise). `type` is an exact event
 * name in the backend; the page sends whatever is typed in its "Filter by type" box on every
 * keystroke, so here it matches any part of the event name, in any case ("asset" finds
 * `asset.published` and `asset.updated`).
 */
adminRoute('GET', '/admin/webhook-deliveries', async (req, ctx): Promise<AdminWebhookPage> => {
  const statusParam = req.query.get('status');
  if (statusParam && !(STATUSES as readonly string[]).includes(statusParam)) {
    throw badRequest(`Unknown status "${statusParam}". Expected one of ${STATUSES.join(', ')}.`);
  }
  const type = (req.query.get('type') ?? '').trim().toLowerCase();
  const rows = (await ctx.db.list<WebhookDeliveryRecord>('webhooks'))
    .filter(
      (d) =>
        (!statusParam || d.status === statusParam) &&
        (!type || d.type.toLowerCase().includes(type)),
    )
    .sort((a, b) => cmpStr(b.createdAt, a.createdAt) || cmpStr(b.id, a.id));
  const page = paginate(rows, req.query, DEFAULT_LIMIT);
  return { items: page.items, pageInfo: page.pageInfo };
});

import type {
  AssetRequest,
  AssetRequestListPage,
  AssetRequestStatus,
  CreateAssetRequestInput,
} from '@/lib/api/types';
import type { RequestRecord, UserRecord } from '../records';
import { route, type PreviewContext } from '../router/router';
import { badRequest, notFound } from '../router/errors';
import { paginate } from '../router/paginate';
import { getMe } from './helpers';
import { createNotification } from './notifications';

/** Backend `AssetRequestStatus` enum. A new request starts as `SENT`. */
export const REQUEST_STATUSES: readonly AssetRequestStatus[] = [
  'SENT',
  'IN_REVIEW',
  'PENDING',
  'APPROVED',
  'REJECTED',
];

const MAX_LINK = 500;
const MAX_TYPE = 80;
const MAX_TEXT = 2000;
const MAX_PRICE = 9_999_999_999.99;
const LINK_PROTOCOLS = new Set(['http:', 'https:', 'ftp:']);

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Newest first, `id` descending as the tiebreak (the backend orders `createdAt desc, id desc`). */
export const newestRequestFirst = (a: RequestRecord, b: RequestRecord) =>
  cmp(b.createdAt, a.createdAt) || cmp(b.id, a.id);

const requestNotFound = (id: string) =>
  notFound(`Request ${id} not found.`, { code: 'request.not_found' });

/** `AssetRequest` payload: the stored facts plus `requester { id, displayName }`. */
export function toAssetRequest(
  r: RequestRecord,
  users: ReadonlyMap<string, Pick<UserRecord, 'displayName'>>,
): AssetRequest {
  return {
    id: r.id,
    assetLink: r.assetLink,
    assetType: r.assetType,
    intendedUse: r.intendedUse,
    price: r.price ?? null,
    notes: r.notes ?? null,
    status: r.status,
    adminComment: r.adminComment ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    requester: {
      id: r.requesterId,
      displayName: users.get(r.requesterId)?.displayName ?? '(unknown)',
    },
  };
}

const usersById = async (ctx: PreviewContext) =>
  new Map((await ctx.db.list<UserRecord>('users')).map((u) => [u.id, u]));

interface FieldProblem {
  path: string;
  code: string;
  message: string;
}

const isUrl = (s: string): boolean => {
  if (/\s/.test(s)) return false;
  try {
    const u = new URL(s);
    return LINK_PROTOCOLS.has(u.protocol) && u.hostname.length > 0;
  } catch {
    return false;
  }
};

/**
 * Validates the create body like the backend DTO (`assetLink` URL with protocol <= 500,
 * `assetType` <= 80, `intendedUse` <= 2000, `price` >= 0, `notes` <= 2000), and, where the
 * backend would accept an empty string, additionally requires text for the three required
 * fields (the form does). Every problem is reported at once, as `fields`.
 */
export function parseCreateRequest(
  raw: unknown,
): Required<Pick<CreateAssetRequestInput, 'assetLink' | 'assetType' | 'intendedUse'>> & {
  price: number | null;
  notes: string | null;
} {
  const body =
    typeof raw === 'object' && raw !== null && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const problems: FieldProblem[] = [];
  const bad = (path: string, code: string, message: string) =>
    problems.push({ path, code, message });

  const text = (path: string, max: number, required: boolean): string | null => {
    const v = body[path];
    if (v === undefined || v === null || v === '') {
      if (required) bad(path, 'required', `${path} is required.`);
      return null;
    }
    if (typeof v !== 'string') {
      bad(path, 'invalid', `${path} must be a string.`);
      return null;
    }
    const t = v.trim();
    if (!t && required) {
      bad(path, 'required', `${path} is required.`);
      return null;
    }
    if (t.length > max) {
      bad(path, 'too_long', `${path} must be at most ${max} characters.`);
      return null;
    }
    return t || null;
  };

  let assetLink = text('assetLink', MAX_LINK, true);
  if (assetLink && !isUrl(assetLink)) {
    bad('assetLink', 'invalid_url', 'assetLink must be a URL address (with http:// or https://).');
    assetLink = null;
  }
  const assetType = text('assetType', MAX_TYPE, true);
  const intendedUse = text('intendedUse', MAX_TEXT, true);
  const notes = text('notes', MAX_TEXT, false);

  let price: number | null = null;
  const p = body.price;
  if (p !== undefined && p !== null && p !== '') {
    const n = typeof p === 'number' ? p : typeof p === 'string' ? Number(p) : Number.NaN;
    if (!Number.isFinite(n) || n < 0 || n > MAX_PRICE) {
      bad('price', 'invalid', 'price must be a number of at least 0.');
    } else {
      price = Math.round(n * 100) / 100;
    }
  }

  if (problems.length > 0) {
    throw badRequest('Invalid request.', { fields: problems });
  }
  return { assetLink: assetLink!, assetType: assetType!, intendedUse: intendedUse!, price, notes };
}

/**
 * Inbox side of a new request, like the backend's `REQUEST_CREATED` fan-out to admins: only an
 * admin persona is told, and only about a request someone else made (nothing is created when the
 * persona is the requester, which is always the case for a request made in the UI). For simulations
 * and tests. Payload keys follow the seed (`requestId`, `requesterName`) plus the request facts.
 * Returns the notification id, if one was created.
 */
export async function notifyPersonaOfRequest(
  ctx: PreviewContext,
  request: RequestRecord,
  requester: Pick<UserRecord, 'id' | 'displayName'>,
): Promise<string | undefined> {
  if (request.requesterId === ctx.meId || requester.id === ctx.meId) return undefined;
  const { isAdmin } = await getMe(ctx);
  if (!isAdmin) return undefined;
  const n = await createNotification(ctx, 'REQUEST_CREATED', {
    requestId: request.id,
    requesterName: requester.displayName,
    assetLink: request.assetLink,
    assetType: request.assetType,
    intendedUse: request.intendedUse,
  });
  return n.id;
}

route('POST', '/asset-requests', async (req, ctx): Promise<AssetRequest> => {
  const input = parseCreateRequest(req.body);
  const now = ctx.now().toISOString();
  const record = await ctx.db.put<RequestRecord>('requests', {
    id: ctx.newId('req'),
    requesterId: ctx.meId,
    assetLink: input.assetLink,
    assetType: input.assetType,
    intendedUse: input.intendedUse,
    price: input.price,
    notes: input.notes,
    status: 'SENT',
    adminComment: null,
    createdAt: now,
    updatedAt: now,
    reviewedById: null,
  });
  return toAssetRequest(record, await usersById(ctx));
});

/**
 * The request history. Deviation from the backend (where an admin lists everybody's requests
 * here): the page is a personal history, and the persona is an admin, so by default it lists the
 * persona's own requests. An admin may pass `requesterId` to look at another person's; the admin
 * queue itself is `/admin/asset-requests`.
 */
route('GET', '/asset-requests', async (req, ctx): Promise<AssetRequestListPage> => {
  const statusParam = req.query.get('status');
  if (statusParam && !(REQUEST_STATUSES as readonly string[]).includes(statusParam)) {
    throw badRequest(
      `Unknown status "${statusParam}". Expected one of ${REQUEST_STATUSES.join(', ')}.`,
    );
  }
  const viewer = await getMe(ctx);
  const requesterId = (viewer.isAdmin && req.query.get('requesterId')) || viewer.id;
  const [rows, users] = await Promise.all([ctx.db.list<RequestRecord>('requests'), usersById(ctx)]);
  const matching = rows
    .filter((r) => r.requesterId === requesterId && (!statusParam || r.status === statusParam))
    .sort(newestRequestFirst);
  const page = paginate(matching, req.query);
  return { items: page.items.map((r) => toAssetRequest(r, users)), pageInfo: page.pageInfo };
});

/** Visible to the requester and to admins; anybody else gets a 404 (the backend answers 403). */
route('GET', '/asset-requests/{id}', async (req, ctx): Promise<AssetRequest> => {
  const id = req.params.id!;
  const [row, viewer] = await Promise.all([ctx.db.get<RequestRecord>('requests', id), getMe(ctx)]);
  if (!row || (!viewer.isAdmin && row.requesterId !== viewer.id)) throw requestNotFound(id);
  return toAssetRequest(row, await usersById(ctx));
});

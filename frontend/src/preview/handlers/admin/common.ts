import type { Viewer } from '../helpers';
import { getMe } from '../helpers';
import { route, type Handler, type PreviewContext, type PreviewRequest } from '../../router/router';
import { badRequest, forbidden } from '../../router/errors';

/**
 * Shared pieces of every `/admin/*` handler (Task 11): the admin gate, the destructive-action
 * confirmation, reason validation and the registry the authorization test walks.
 */

/** `AdminGuard`: only an admin passes (the persona is an admin in the seed). */
export async function requireAdmin(ctx: PreviewContext): Promise<Viewer> {
  const viewer = await getMe(ctx);
  if (!viewer.isAdmin) throw forbidden('Admin role required.', { code: 'auth.forbidden' });
  return viewer;
}

/** The phrase the destructive modals send (`CONFIRMATION_PHRASE` in the backend). */
export const CONFIRMATION_PHRASE = 'I understand';
/** `confirmedAt` must be at most this old (`CONFIRMATION_WINDOW_SEC`). */
export const CONFIRMATION_WINDOW_MS = 60_000;

const confirmationError = (code: 'confirmation.required' | 'confirmation.expired', msg: string) =>
  badRequest(msg, { code });

/**
 * The backend's `ConfirmationGuard` (`@RequireConfirmation()`): `body.confirm` must be exactly
 * "I understand" and `body.confirmedAt` an ISO date no older than 60 seconds (by `ctx.now()`).
 * Missing or wrong phrase / missing or unparsable timestamp: 400 `confirmation.required`; a stale
 * timestamp: 400 `confirmation.expired`. Like the guard it runs before the handler looks at
 * anything else (so an unknown id with a bad confirmation is still a confirmation error).
 */
export function requireConfirmation(ctx: PreviewContext, body: unknown): void {
  const b =
    typeof body === 'object' && body !== null && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};
  if (b.confirm !== CONFIRMATION_PHRASE) {
    throw confirmationError(
      'confirmation.required',
      `Confirmation phrase missing - set body.confirm to "${CONFIRMATION_PHRASE}".`,
    );
  }
  if (!b.confirmedAt) {
    throw confirmationError(
      'confirmation.required',
      'Confirmation timestamp missing - set body.confirmedAt to an ISO-8601 UTC value.',
    );
  }
  const ts = typeof b.confirmedAt === 'string' ? Date.parse(b.confirmedAt) : Number.NaN;
  if (!Number.isFinite(ts)) {
    throw confirmationError(
      'confirmation.required',
      'Confirmation timestamp is not a valid ISO-8601 date.',
    );
  }
  if (ctx.now().getTime() - ts > CONFIRMATION_WINDOW_MS) {
    throw confirmationError(
      'confirmation.expired',
      'Confirmation expired - re-confirm within the last 60 seconds.',
    );
  }
}

export type AdminHandler = (
  req: PreviewRequest,
  ctx: PreviewContext,
  admin: Viewer,
) => unknown | Promise<unknown>;

export interface AdminRouteInfo {
  method: PreviewRequest['method'];
  pattern: string;
  confirm: boolean;
}

/** Every route registered through `adminRoute` (the authorization test walks this list). */
export const adminRoutes: AdminRouteInfo[] = [];

/**
 * Registers an `/admin/*` route behind `requireAdmin` (and, with `confirm: true`, behind
 * `requireConfirmation`, in the backend guard order: admin first, then confirmation, then the
 * handler). Use this for every admin route so none can forget the gate.
 */
export function adminRoute(
  method: PreviewRequest['method'],
  pattern: string,
  handler: AdminHandler,
  opts: { confirm?: boolean } = {},
): void {
  adminRoutes.push({ method, pattern, confirm: opts.confirm === true });
  const wrapped: Handler = async (req, ctx) => {
    const admin = await requireAdmin(ctx);
    if (opts.confirm) requireConfirmation(ctx, req.body);
    return handler(req, ctx, admin);
  };
  route(method, pattern, wrapped);
}

/* -------------------------------------------------------------------------- *
 * Reasons
 * -------------------------------------------------------------------------- */

const REASON_MIN = 4;
const REASON_MAX = 500;

/**
 * `AdminAssetActionDto.reason`: a string of 4..500 characters, required by the archive,
 * soft-delete and force-delete routes (400 with `fields` otherwise). With `required: false`
 * a missing reason is `undefined`; a given one is still validated.
 */
export function parseReason(body: unknown, opts: { required: boolean }): string | undefined {
  const raw =
    typeof body === 'object' && body !== null && !Array.isArray(body)
      ? (body as Record<string, unknown>).reason
      : undefined;
  if (raw === undefined || raw === null) {
    if (!opts.required) return undefined;
    throw badRequest('A reason is required.', {
      fields: [{ path: 'reason', code: 'required', message: 'reason must be a string.' }],
    });
  }
  if (typeof raw !== 'string') {
    throw badRequest('reason must be a string.', {
      fields: [{ path: 'reason', code: 'invalid', message: 'reason must be a string.' }],
    });
  }
  const reason = raw.trim();
  if (reason.length < REASON_MIN || reason.length > REASON_MAX) {
    throw badRequest(`reason must be between ${REASON_MIN} and ${REASON_MAX} characters.`, {
      fields: [
        {
          path: 'reason',
          code: 'length',
          message: `reason must be between ${REASON_MIN} and ${REASON_MAX} characters.`,
        },
      ],
    });
  }
  return reason;
}

/* -------------------------------------------------------------------------- *
 * Small shared helpers
 * -------------------------------------------------------------------------- */

export const cmpStr = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export const DAY_MS = 24 * 60 * 60 * 1000;
/** `YYYY-MM-DD` (UTC) of a Date or ISO string. */
export const dayOf = (d: Date | string): string =>
  (typeof d === 'string' ? new Date(d) : d).toISOString().slice(0, 10);
export const dayNumber = (day: string): number =>
  Math.floor(Date.parse(`${day}T00:00:00Z`) / DAY_MS);
export const dayFromNumber = (n: number): string => new Date(n * DAY_MS).toISOString().slice(0, 10);

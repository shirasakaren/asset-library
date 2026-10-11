import type { AdminUser, AdminUserPage } from '@/lib/api/admin-types';
import type { AssetRecord, UserRecord } from '../../records';
import { conflict, notFound } from '../../router/errors';
import { paginate } from '../../router/paginate';
import { recordAudit } from '../audit-core';
import { normalize } from '../text-search';
import { serialized } from '../write-queue';
import { adminRoute, cmpStr } from './common';

/**
 * Admin user list: newest accounts first (`createdAt desc, id desc`, as the backend), `q` is a
 * case- and diacritic-insensitive "contains" on display name and email, `isAdmin=true` lists admins
 * (any other value lists non-admins), cursor pages. `publishedAssetCount` counts PUBLISHED assets.
 * The same list serves the promote picker and the transfer modal (`q` + `limit=8`).
 */
adminRoute('GET', '/admin/users', async (req, ctx): Promise<AdminUserPage> => {
  const needle = normalize((req.query.get('q') ?? '').trim());
  const flag = req.query.get('isAdmin');
  const [users, assets] = await Promise.all([
    ctx.db.list<UserRecord>('users'),
    ctx.db.list<AssetRecord>('assets'),
  ]);
  const published = new Map<string, number>();
  for (const a of assets) {
    if (a.status === 'PUBLISHED') published.set(a.ownerId, (published.get(a.ownerId) ?? 0) + 1);
  }
  const rows = users
    .filter(
      (u) =>
        (!needle ||
          normalize(u.displayName).includes(needle) ||
          normalize(u.email).includes(needle)) &&
        (flag === null || flag === '' || u.isAdmin === (flag === 'true')),
    )
    .sort((a, b) => cmpStr(b.createdAt, a.createdAt) || cmpStr(b.id, a.id));
  const page = paginate(rows, req.query);
  return {
    items: page.items.map((u): AdminUser => ({
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      isAdmin: u.isAdmin,
      locale: u.locale,
      createdAt: u.createdAt,
      publishedAssetCount: published.get(u.id) ?? 0,
      avatar: u.avatar,
    })),
    pageInfo: page.pageInfo,
  };
});

const userNotFound = (id: string) => notFound(`User ${id} not found.`, { code: 'user.not_found' });

/**
 * Promote to admin (`@RequireConfirmation`). Role and flag change together (`isAdmin === (role ===
 * 'admin')`). Promoting an admin is a no-op. Audit `user.promote` `{ role: 'admin' }` (the seed's
 * shape). The backend's `ADMIN_PROMOTED` notification goes to the promoted user, and only the
 * persona has an inbox: the persona is already an admin (it is the caller), so none is created.
 */
adminRoute(
  'POST',
  '/admin/users/{id}/promote',
  (req, ctx) =>
    serialized(async () => {
      const id = req.params.id!;
      const target = await ctx.db.get<UserRecord>('users', id);
      if (!target) throw userNotFound(id);
      if (target.isAdmin) return undefined;
      await ctx.db.patch<UserRecord>('users', id, { role: 'admin', isAdmin: true });
      await recordAudit(ctx, {
        action: 'user.promote',
        subjectType: 'User',
        subjectId: id,
        metadata: { role: 'admin' },
      });
      return undefined;
    }),
  { confirm: true },
);

/** Shown (as the toast of the demote modal) when the persona tries to demote herself. */
export const SELF_DEMOTE_MESSAGE =
  "Demo mode: you can't demote yourself, but you can demote other admins.";

/**
 * Demote an admin (`@RequireConfirmation`). Demoting a non-admin is a no-op.
 *  - Last admin: 409 `admin.cannot_remove_last_admin` (the code `demote-admin-modal.tsx` branches
 *    on and answers with "Cannot demote the last remaining admin").
 *  - Preview-only: the persona demoting HERSELF while another admin exists is a 409
 *    `users.self_demote_preview`. She would lose the admin UI (every `/admin` page would turn into
 *    a 403) and the demo has no way back. The last-admin check comes first.
 * The new role is `contributor` when the user owns a published asset, else `user`. Audit
 * `user.demote` `{ role }`. The `ADMIN_DEMOTED` notification would go to the demoted user: the only
 * inbox is the persona's, and she cannot be demoted here, so none is created.
 */
adminRoute(
  'POST',
  '/admin/users/{id}/demote',
  (req, ctx) =>
    serialized(async () => {
      const id = req.params.id!;
      const [target, users, assets] = await Promise.all([
        ctx.db.get<UserRecord>('users', id),
        ctx.db.list<UserRecord>('users'),
        ctx.db.list<AssetRecord>('assets'),
      ]);
      if (!target) throw userNotFound(id);
      if (!target.isAdmin) return undefined;
      const otherAdmins = users.filter((u) => u.isAdmin && u.id !== id).length;
      if (otherAdmins === 0) {
        throw conflict('Refusing to demote - this would leave the system with zero admins.', {
          code: 'admin.cannot_remove_last_admin',
        });
      }
      if (id === ctx.meId)
        throw conflict(SELF_DEMOTE_MESSAGE, { code: 'users.self_demote_preview' });
      const role = assets.some((a) => a.ownerId === id && a.status === 'PUBLISHED')
        ? 'contributor'
        : 'user';
      await ctx.db.patch<UserRecord>('users', id, { role, isAdmin: false });
      await recordAudit(ctx, {
        action: 'user.demote',
        subjectType: 'User',
        subjectId: id,
        metadata: { role },
      });
      return undefined;
    }),
  { confirm: true },
);

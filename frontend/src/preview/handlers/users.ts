import type { ServerAvatar } from '@/lib/api/types';
import type { AssetRecord, UserRecord } from '../records';
import { route } from '../router/router';
import { forbidden, notFound } from '../router/errors';
import { getMe } from './helpers';
import { normalize } from './text-search';

/** Backend `UsersService.searchUsers`: needles shorter than this match nothing, at most 20 rows. */
const MIN_NEEDLE = 2;
const MAX_RESULTS = 20;

export interface UserSearchResult {
  id: string;
  email: string;
  displayName: string;
  isAdmin: boolean;
}

export interface UserPublicProfile {
  id: string;
  displayName: string;
  avatar: ServerAvatar;
  joinedAt: string;
  publishedAssetCount: number;
  /** Only for the user themselves and for admins. */
  email?: string;
}

/**
 * Admin typeahead over users, like the backend (the persona is an admin): `q` of two or more
 * characters, case- and diacritic-insensitive "contains" on display name and email, admins first
 * then by display name, `limit` clamped to 1..20 (a malformed one means 20). Non-admins get a 403.
 * Emails are part of the backend result (the promote picker shows them), so they are returned.
 */
route('GET', '/users/search', async (req, ctx): Promise<UserSearchResult[]> => {
  const viewer = await getMe(ctx);
  if (!viewer.isAdmin) throw forbidden('Admins only.');
  const needle = normalize((req.query.get('q') ?? '').trim());
  if (needle.length < MIN_NEEDLE) return [];
  const raw = Number(req.query.get('limit'));
  const limit =
    req.query.get('limit') && Number.isInteger(raw)
      ? Math.min(Math.max(raw, 1), MAX_RESULTS)
      : MAX_RESULTS;
  const rows = await ctx.db.list<UserRecord>('users');
  return rows
    .filter((u) => normalize(u.displayName).includes(needle) || normalize(u.email).includes(needle))
    .sort(
      (a, b) =>
        Number(b.isAdmin) - Number(a.isAdmin) ||
        a.displayName.localeCompare(b.displayName) ||
        (a.id < b.id ? -1 : 1),
    )
    .slice(0, limit)
    .map((u) => ({ id: u.id, email: u.email, displayName: u.displayName, isAdmin: u.isAdmin }));
});

/**
 * Public profile. The backend has no asset list here, only the PUBLISHED asset count; the email
 * is included for the user themselves and admins (the admin user page shows it).
 */
route('GET', '/users/{id}', async (req, ctx): Promise<UserPublicProfile> => {
  const id = req.params.id!;
  const [user, viewer, assets] = await Promise.all([
    ctx.db.get<UserRecord>('users', id),
    getMe(ctx),
    ctx.db.list<AssetRecord>('assets'),
  ]);
  if (!user) throw notFound(`User ${id} not found.`, { code: 'user.not_found' });
  const profile: UserPublicProfile = {
    id: user.id,
    displayName: user.displayName,
    avatar: user.avatar,
    joinedAt: user.createdAt,
    publishedAssetCount: assets.filter((a) => a.ownerId === user.id && a.status === 'PUBLISHED')
      .length,
  };
  if (viewer.id === user.id || viewer.isAdmin) profile.email = user.email;
  return profile;
});

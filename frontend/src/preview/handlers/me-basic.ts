import type { MeResponse } from '@/lib/api/types';
import type { AssetRecord, NotificationRecord, UserRecord } from '../records';
import { route, type PreviewContext } from '../router/router';
import { badRequest, notFound } from '../router/errors';
import { getMe, isLocale } from './helpers';

/** The persona's `MeResponse`, with the derived `hasPublishedAssets` / `unreadNotifications`. */
export async function buildMeResponse(ctx: PreviewContext): Promise<MeResponse> {
  const { user } = await getMe(ctx);
  if (!user) throw notFound(`User ${ctx.meId} not found.`, { code: 'user.not_found' });
  const [assets, notifications] = await Promise.all([
    ctx.db.list<AssetRecord>('assets'),
    ctx.db.list<NotificationRecord>('notifications'),
  ]);
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    locale: user.locale,
    isAdmin: user.isAdmin,
    role: user.role,
    avatar: user.avatar,
    hasPublishedAssets: assets.some((a) => a.ownerId === user.id && a.status === 'PUBLISHED'),
    unreadNotifications: notifications.filter((n) => !n.readAt).length,
    createdAt: user.createdAt,
  };
}

route('GET', '/auth/me', (_req, ctx) => buildMeResponse(ctx));

route('PATCH', '/auth/me/locale', async (req, ctx) => {
  const body = req.body as { locale?: unknown } | null | undefined;
  const locale = body && typeof body === 'object' ? body.locale : undefined;
  if (!isLocale(locale)) {
    throw badRequest('locale must be "en" or "id".', {
      fields: [{ path: 'locale', code: 'invalid', message: 'Expected "en" or "id".' }],
    });
  }
  const { user } = await getMe(ctx);
  if (!user) throw notFound(`User ${ctx.meId} not found.`, { code: 'user.not_found' });
  await ctx.db.patch<UserRecord>('users', user.id, { locale });
  return buildMeResponse(ctx);
});

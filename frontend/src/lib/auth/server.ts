// TEMPORARY — deleted in Task 5 when server pages become client pages
//
// Trivial stand-ins so the not-yet-converted server pages keep type-checking
// after real auth was removed. They are NOT functional at runtime in the
// static export; every caller is replaced by `useMe()` / client queries.
import { redirect } from 'next/navigation';
import type { MeResponse } from '@/lib/api/types';

const PREVIEW_ME: MeResponse = {
  id: 'preview-admin',
  email: 'demo@asset.creations.ren',
  displayName: 'Preview Admin',
  locale: 'en',
  isAdmin: true,
  role: 'admin',
  avatar: { initials: 'PA', bgColor: 'brand-blue', fgColor: 'ink-white' },
  hasPublishedAssets: true,
  unreadNotifications: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
};

export interface ResolvedSession {
  accessToken?: string;
  expiresAt?: number;
  error?: string;
  mock?: true;
}

export async function requireSession(_callbackUrl?: string): Promise<ResolvedSession> {
  return { mock: true, accessToken: 'preview', expiresAt: Number.MAX_SAFE_INTEGER };
}

export async function fetchMe(_session: ResolvedSession): Promise<MeResponse> {
  return PREVIEW_ME;
}

export async function requireAdmin(): Promise<MeResponse> {
  const me = await fetchMe(await requireSession());
  if (!me.isAdmin) redirect('/403');
  return me;
}

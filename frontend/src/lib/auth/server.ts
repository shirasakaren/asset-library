import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { auth, isMockAuth } from './index';
import { apiFetch } from '@/lib/api/fetcher';
import type { MeResponse } from '@/lib/api/types';
import { logger } from '@/lib/logger';

const MOCK_USER: MeResponse = {
  id: 'mock-admin',
  email: 'admin@labmgm.org',
  displayName: 'Mock Admin',
  locale: 'en',
  isAdmin: true,
  role: 'admin',
  avatar: { initials: 'MA', bgColor: 'brand-blue', fgColor: 'ink-white' },
  hasPublishedAssets: false,
  unreadNotifications: 0,
  createdAt: new Date('2025-01-01T00:00:00Z').toISOString(),
};

export interface ResolvedSession {
  accessToken?: string;
  expiresAt?: number;
  error?: string;
  mock?: true;
}

// Cached per request so layout + page server components share a single
// underlying call to `auth()` instead of running it twice on every navigation.
export const getSession = cache(async (): Promise<ResolvedSession | null> => {
  if (isMockAuth) {
    return { mock: true, accessToken: 'mock', expiresAt: Number.MAX_SAFE_INTEGER };
  }
  const session = await auth();
  if (!session) return null;
  return {
    accessToken: session.accessToken,
    expiresAt: session.expiresAt,
    error: session.error,
  };
});

export async function requireSession(callbackUrl?: string): Promise<ResolvedSession> {

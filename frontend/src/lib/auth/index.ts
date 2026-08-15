import NextAuth, { type NextAuthConfig } from 'next-auth';
import Keycloak from 'next-auth/providers/keycloak';
import { serverEnv } from '@/lib/env';
import { publicEnv } from '@/lib/env.public';

const MOCK_MODE = publicEnv.NEXT_PUBLIC_AUTH_MOCK && serverEnv.NODE_ENV !== 'production';

interface KeycloakTokenSet {
  accessToken: string;
  idToken?: string;
  refreshToken?: string;
  expiresAt: number; // unix seconds
}

async function refreshKeycloakToken(tokens: KeycloakTokenSet): Promise<KeycloakTokenSet> {
  const url = `${serverEnv.KEYCLOAK_ISSUER}/protocol/openid-connect/token`;
  const params = new URLSearchParams({
    client_id: serverEnv.KEYCLOAK_CLIENT_ID,
    client_secret: serverEnv.KEYCLOAK_CLIENT_SECRET,
    grant_type: 'refresh_token',
    refresh_token: tokens.refreshToken ?? '',
  });
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Failed to refresh Keycloak token: ${res.status}`);
  }
  const refreshed = (await res.json()) as {
    access_token: string;
    id_token?: string;
    refresh_token?: string;
    expires_in: number;
  };
  return {
    accessToken: refreshed.access_token,
    idToken: refreshed.id_token ?? tokens.idToken,
    refreshToken: refreshed.refresh_token ?? tokens.refreshToken,
    expiresAt: Math.floor(Date.now() / 1000) + refreshed.expires_in,
  };
}

export const authConfig: NextAuthConfig = {
  trustHost: true,
  session: {
    strategy: 'jwt',
    maxAge: serverEnv.SESSION_MAX_AGE_SECONDS,
  },
  pages: {
    error: '/auth/error',
    signIn: '/auth/signin',
  },
  providers: MOCK_MODE
    ? []
    : [
        Keycloak({
          clientId: serverEnv.KEYCLOAK_CLIENT_ID,
          clientSecret: serverEnv.KEYCLOAK_CLIENT_SECRET,
          issuer: serverEnv.KEYCLOAK_ISSUER,
        }),
      ],
  callbacks: {
    async jwt({ token, account }) {
      // Initial sign-in: stash Keycloak token set on the JWT.
      if (account?.access_token) {
        token.accessToken = account.access_token;
        token.idToken = account.id_token as string | undefined;
        token.refreshToken = account.refresh_token as string | undefined;
        token.expiresAt =
          (account.expires_at as number | undefined) ??
          Math.floor(Date.now() / 1000) + 300;
        return token;
      }

      const expiresAt = (token.expiresAt as number | undefined) ?? 0;
      const now = Math.floor(Date.now() / 1000);

      // Token still fresh — return as-is.
      if (expiresAt - 60 > now) {
        return token;
      }

      // No refresh token — push the user back to sign-in.
      if (!token.refreshToken) {
        token.error = 'RefreshAccessTokenError';
        return token;
      }

      try {
        const refreshed = await refreshKeycloakToken({
          accessToken: token.accessToken as string,
          idToken: token.idToken as string | undefined,
          refreshToken: token.refreshToken as string,
          expiresAt,
        });
        token.accessToken = refreshed.accessToken;
        token.idToken = refreshed.idToken;
        token.refreshToken = refreshed.refreshToken;
        token.expiresAt = refreshed.expiresAt;
        token.error = undefined;
      } catch {
        token.error = 'RefreshAccessTokenError';
      }
      return token;
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string | undefined;
      session.error = token.error as string | undefined;
      session.expiresAt = token.expiresAt as number | undefined;
      return session;
    },
  },
  events: {
    async signOut(message) {
      // Best-effort: call Keycloak end_session with the id_token hint.
      const idToken =
        ('token' in message && message.token && 'idToken' in message.token
          ? (message.token.idToken as string | undefined)
          : undefined) ?? undefined;
      if (!idToken) return;
      const url = new URL(`${serverEnv.KEYCLOAK_ISSUER}/protocol/openid-connect/logout`);
      url.searchParams.set('id_token_hint', idToken);
      url.searchParams.set('post_logout_redirect_uri', serverEnv.KEYCLOAK_LOGOUT_REDIRECT);
      try {
        await fetch(url.toString(), { method: 'GET', cache: 'no-store' });
      } catch {
        /* ignore — best-effort */
      }
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);

export const isMockAuth = MOCK_MODE;

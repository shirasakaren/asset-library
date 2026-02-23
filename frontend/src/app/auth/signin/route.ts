import { redirect } from 'next/navigation';
import { type NextRequest } from 'next/server';
import { signIn } from '@/lib/auth';

// Initiating the Keycloak OAuth flow writes PKCE/state/nonce cookies. Next.js
// only permits cookie mutation inside a Route Handler or Server Action — never
// during a page render. The previous implementation lived in page.tsx and
// called signIn() while rendering, which threw "Cookies can only be modified
// in a Server Action or Route Handler" and surfaced as a 500 on /auth/signin.
// Handling the route as a GET handler lets Auth.js set those cookies and issue
// the redirect to Keycloak's authorization endpoint.
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const callbackUrl = request.nextUrl.searchParams.get('callbackUrl') ?? '/';
  // Auth.js's signIn() throws a redirect once the provider URL and cookies are
  // prepared; the redirect below only runs if signIn returns without one.
  await signIn('keycloak', { redirectTo: callbackUrl });
  redirect(callbackUrl);
}

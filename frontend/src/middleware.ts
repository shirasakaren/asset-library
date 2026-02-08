import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/lib/auth';

const PUBLIC_PREFIXES = [
  '/about',
  '/auth',
  '/api/auth',
  '/health',
  '/_next',
  '/favicon',
  '/brand',
  '/patterns',
  '/robots.txt',
  '/sitemap.xml',
  '/403',
];

const SUPPORTED_LOCALES = (process.env.NEXT_PUBLIC_SUPPORTED_LOCALES ?? 'en,id').split(',');
const DEFAULT_LOCALE = process.env.NEXT_PUBLIC_DEFAULT_LOCALE ?? 'en';

function negotiateLocale(req: NextRequest): string {
  const cookie = req.cookies.get('NEXT_LOCALE')?.value;
  if (cookie && SUPPORTED_LOCALES.includes(cookie)) return cookie;
  const header = req.headers.get('accept-language') ?? '';
  for (const part of header.split(',')) {
    const tag = part.split(';')[0]!.trim().toLowerCase();
    const lang = tag.split('-')[0]!;
    if (SUPPORTED_LOCALES.includes(lang)) return lang;
  }
  return DEFAULT_LOCALE;
}

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

const MOCK = (process.env.NEXT_PUBLIC_AUTH_MOCK ?? 'false') === 'true';

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const response = NextResponse.next();

  // Set the NEXT_LOCALE cookie if missing or drifted from negotiation.
  const negotiated = negotiateLocale(req);
  if (req.cookies.get('NEXT_LOCALE')?.value !== negotiated) {
    response.cookies.set('NEXT_LOCALE', negotiated, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax',
    });
  }

  if (isPublic(pathname) || MOCK) return response;

  const session = await auth();
  if (!session) {
    const signInUrl = new URL('/auth/signin', req.url);
    signInUrl.searchParams.set('callbackUrl', pathname + search);
    return NextResponse.redirect(signInUrl);
  }

  if (session.error === 'RefreshAccessTokenError') {
    const errUrl = new URL('/auth/error', req.url);
    errUrl.searchParams.set('reason', 'session-expired');
    return NextResponse.redirect(errUrl);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

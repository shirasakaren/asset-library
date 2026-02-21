import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth/server';
import { apiFetch } from '@/lib/api/fetcher';
import { ApiError } from '@/lib/api/errors';

const BodySchema = z.object({ locale: z.enum(['en', 'id']) });

export async function PATCH(request: NextRequest) {
  const raw = await request.json().catch(() => null);
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ code: 'validation.failed' }, { status: 400 });
  }

  const session = await getSession();
  if (!session) {
    // Cookie-only path: still let the client set NEXT_LOCALE so unauthenticated
    // visits to /about respect the chosen language.
    const res = NextResponse.json({ ok: true });
    res.cookies.set('NEXT_LOCALE', parsed.data.locale, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax',
    });
    return res;
  }

  if (!session.mock) {
    try {
      await apiFetch('/auth/me/locale', {
        method: 'PATCH',
        body: { locale: parsed.data.locale },
        accessToken: session.accessToken,
      });
    } catch (err) {
      if (ApiError.isApiError(err)) {
        return NextResponse.json({ code: err.code }, { status: err.status });
      }
      return NextResponse.json({ code: 'upstream.error' }, { status: 502 });
    }
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set('NEXT_LOCALE', parsed.data.locale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  });
  return res;
}

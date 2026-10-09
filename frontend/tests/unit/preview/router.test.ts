import { describe, it, expect, vi } from 'vitest';
import { createTestApp } from '@/preview/test-utils';
import { paginate } from '@/preview/router/paginate';
import { route, dispatch, type PreviewContext } from '@/preview/router/router';
import { notFound, badRequest, forbidden, conflict, internalError } from '@/preview/router/errors';
import { previewFetch } from '@/preview';
import { ApiError } from '@/lib/api/errors';

const isStatus = (status: number) => (e: unknown) =>
  ApiError.isApiError(e) && (e as ApiError).status === status;

describe('router', () => {
  it('unknown endpoint rejects with a 404 ApiError (Review Focus 4)', async () => {
    const app = await createTestApp();
    await expect(app.call('GET', '/nope')).rejects.toSatisfy(isStatus(404));
  });

  it('extracts {x} and :x params and decodes them', async () => {
    route('GET', '/t-curly/{idOrSlug}/child/{n}', (req) => req.params);
    route('GET', '/t-colon/:id', (req) => req.params);
    const app = await createTestApp();
    expect(await app.call('GET', '/t-curly/a%20b/child/7')).toEqual({ idOrSlug: 'a b', n: '7' });
    expect(await app.call('GET', '/t-colon/xyz')).toEqual({ id: 'xyz' });
  });

  it('params do not span path segments and the whole path must match', async () => {
    route('GET', '/t-strict/:id', () => 'ok');
    const app = await createTestApp();
    await expect(app.call('GET', '/t-strict/a/b')).rejects.toSatisfy(isStatus(404));
    await expect(app.call('GET', '/x/t-strict/a')).rejects.toSatisfy(isStatus(404));
  });

  it('first match wins (specific before parameterized)', async () => {
    route('GET', '/t-order/special', () => 'specific');
    route('GET', '/t-order/:id', () => 'param');
    route('GET', '/t-order2/:id', () => 'param');
    route('GET', '/t-order2/special', () => 'specific');
    const app = await createTestApp();
    expect(await app.call('GET', '/t-order/special')).toBe('specific');
    expect(await app.call('GET', '/t-order/other')).toBe('param');
    expect(await app.call('GET', '/t-order2/special')).toBe('param');
  });

  it('method mismatch yields 404', async () => {
    route('GET', '/t-method', () => 'got');
    const app = await createTestApp();
    expect(await app.call('GET', '/t-method')).toBe('got');
    await expect(app.call('POST', '/t-method')).rejects.toSatisfy(isStatus(404));
  });

  it('passes query, body, locale and ctx to handlers', async () => {
    route('POST', '/t-echo', (req, ctx) => ({
      q: req.query.getAll('a'),
      body: req.body,
      locale: req.locale,
      me: ctx.meId,
      path: req.path,
      method: req.method,
    }));
    const app = await createTestApp();
    const out = await app.call('POST', '/t-echo', {
      query: { a: ['1', '2'], skip: undefined, empty: '' },
      body: { x: 1 },
      locale: 'id',
    });
    expect(out).toEqual({
      q: ['1', '2'],
      body: { x: 1 },
      locale: 'id',
      me: 'u-persona',
      path: '/t-echo',
      method: 'POST',
    });
  });

  it('ApiErrors thrown by handlers propagate unchanged', async () => {
    route('GET', '/t-throws-api', () => {
      throw forbidden('nope');
    });
    const app = await createTestApp();
    await expect(app.call('GET', '/t-throws-api')).rejects.toSatisfy(isStatus(403));
  });

  it('createTestApp isolates db per call and honours meId override', async () => {
    route('GET', '/t-me', (_r, ctx) => ctx.meId);
    const a = await createTestApp({ assets: [{ id: 'a1' }] }, { meId: 'u-other' });
    const b = await createTestApp({ assets: [{ id: 'b1' }] });
    expect(await a.call('GET', '/t-me')).toBe('u-other');
    expect(await b.call('GET', '/t-me')).toBe('u-persona');
    expect((await a.db.list('assets')).map((d) => d.id)).toEqual(['a1']);
    expect((await b.db.list('assets')).map((d) => d.id)).toEqual(['b1']);
    expect(a.db.persistent).toBe(false);
  });

  it('ctx.newId yields unique prefixed ids and ctx.emit reaches the bus', async () => {
    const { bus } = await import('@/preview/events/bus');
    const seen: unknown[] = [];
    const off = bus.on((e) => seen.push(e));
    route('POST', '/t-ids', (_r, ctx) => {
      ctx.emit({ type: 'assets.changed' });
      return [ctx.newId('as'), ctx.newId('as')];
    });
    const app = await createTestApp();
    const [x, y] = await app.call<string[]>('POST', '/t-ids');
    off();
    expect(x).toMatch(/^as-/);
    expect(x).not.toBe(y);
    expect(seen).toEqual([{ type: 'assets.changed' }]);
  });
});

describe('dispatch', () => {
  it('maps non-ApiError throws to a 500 ApiError', async () => {
    route('GET', '/t-boom', () => {
      throw new Error('kaboom');
    });
    const app = await createTestApp();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const err = await app.call('GET', '/t-boom').catch((e) => e);
    spy.mockRestore();
    expect(ApiError.isApiError(err)).toBe(true);
    expect((err as ApiError).status).toBe(500);
    expect((err as ApiError).code).toBe('http.internal');
  });

  it('is exported and rejects directly on unknown route', async () => {
    const app = await createTestApp();
    const ctx = { db: app.db } as PreviewContext;
    await expect(
      dispatch(
        {
          method: 'GET',
          path: '/zzz',
          query: new URLSearchParams(),
          body: undefined,
          locale: 'en',
        },
        ctx,
      ),
    ).rejects.toSatisfy(isStatus(404));
  });
});

describe('errors', () => {
  it('builds real ApiErrors', () => {
    const n = notFound();
    expect(n).toBeInstanceOf(ApiError);
    expect([n.status, n.code]).toEqual([404, 'http.not_found']);
    const b = badRequest('bad input');
    expect([b.status, b.code, b.message]).toEqual([400, 'http.bad_request', 'bad input']);
    const f = forbidden();
    expect([f.status, f.code]).toEqual([403, 'http.forbidden']);
    expect(notFound('gone').message).toBe('gone');
  });

  it('accepts code / fields / extra overrides and builds 409 and 500', () => {
    const fields = [{ path: 'thumbnail', code: 'required', message: 'Thumbnail required' }];
    const blocked = conflict('cannot publish', { code: 'asset.publish_blocked', fields });
    expect(blocked).toBeInstanceOf(ApiError);
    expect([blocked.status, blocked.code, blocked.message]).toEqual([
      409,
      'asset.publish_blocked',
      'cannot publish',
    ]);
    expect(blocked.fields).toEqual(fields);
    expect(conflict('dup').code).toBe('http.conflict');

    const bad = badRequest('x', { code: 'validation.failed' });
    expect([bad.status, bad.code]).toEqual([400, 'validation.failed']);
    expect(forbidden('no', { code: 'auth.forbidden' }).code).toBe('auth.forbidden');
    expect(notFound('gone', { code: 'asset.not_found' }).code).toBe('asset.not_found');
    const ise = internalError('oops', { extra: { traceId: 't1' } });
    expect([ise.status, ise.code]).toEqual([500, 'http.internal']);
    expect((ise as ApiError & { extra?: unknown }).extra).toEqual({ traceId: 't1' });
  });
});

describe('route registration', () => {
  it('normalizes a trailing slash in registered patterns', async () => {
    route('GET', '/t-trail-pattern/', () => 'ok');
    route('GET', '/t-trail-param/:id/', (req) => req.params.id);
    const app = await createTestApp();
    expect(await app.call('GET', '/t-trail-pattern')).toBe('ok');
    expect(await app.call('GET', '/t-trail-pattern/')).toBe('ok');
    expect(await app.call('GET', '/t-trail-param/q')).toBe('q');
  });

  it('throws at registration for a param mixed with literal text', () => {
    expect(() => route('GET', '/f/{id}.pdf', () => 1)).toThrow(/unsupported/i);
    expect(() => route('GET', '/f/pre{id}', () => 1)).toThrow(/unsupported/i);
    expect(() => route('GET', '/f/:id.pdf', () => 1)).toThrow(/unsupported/i);
    expect(() => route('GET', '/f/{}', () => 1)).toThrow(/unsupported/i);
  });

  it('request path with trailing slash and unicode/space slugs resolve', async () => {
    route('GET', '/t-slug/:slug', (req) => req.params.slug);
    const app = await createTestApp();
    expect(await app.call('GET', '/t-slug/abc/')).toBe('abc');
    const slug = 'café mañana/日本';
    expect(await app.call('GET', `/t-slug/${encodeURIComponent(slug)}`)).toBe(slug);
  });
});

describe('previewFetch', () => {
  it('serializes query (arrays repeat, empty/undefined/null skipped) and clones results', async () => {
    const SHARED = { n: 1 };
    route('GET', '/t-pf-query', (req) => ({ raw: req.query.toString(), shared: SHARED }));
    const out = await previewFetch<{ raw: string; shared: { n: number } }>('/t-pf-query', {
      query: { tag: ['a', 'b', '', undefined], q: '', n: 0, f: false, u: undefined, z: null },
    });
    expect(out.raw).toBe('tag=a&tag=b&n=0&f=false');
    out.shared.n = 99;
    const again = await previewFetch<{ shared: { n: number } }>('/t-pf-query', {});
    expect(again.shared.n).toBe(1);
  });

  it('defaults method to GET and locale to en; rejects 404 for unknown', async () => {
    route('GET', '/t-pf-defaults', (req) => req.locale);
    expect(await previewFetch('/t-pf-defaults', {})).toBe('en');
    await expect(previewFetch('/t-pf-missing', {})).rejects.toSatisfy(isStatus(404));
  });
});

describe('paginate', () => {
  const items = Array.from({ length: 25 }, (_, i) => ({ id: `id${String(i).padStart(2, '0')}` }));
  it('walks all pages without duplicates or gaps', () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 10; i++) {
      const q: URLSearchParams = new URLSearchParams({
        limit: '10',
        ...(cursor ? { cursor } : {}),
      });
      const page: ReturnType<typeof paginate<{ id: string }>> = paginate(items, q);
      seen.push(...page.items.map((x) => x.id));
      if (!page.pageInfo.hasMore) break;
      cursor = page.pageInfo.nextCursor;
    }
    expect(seen).toEqual(items.map((x) => x.id));
  });
  it('empty list returns empty page', () => {
    expect(paginate([], new URLSearchParams())).toEqual({
      items: [],
      pageInfo: { nextCursor: null, hasMore: false },
    });
  });
  it('limit larger than list returns everything with no more pages', () => {
    const page = paginate(items, new URLSearchParams({ limit: '100' }));
    expect(page.items).toHaveLength(25);
    expect(page.pageInfo).toEqual({ nextCursor: null, hasMore: false });
  });
  it('exact fit has no more pages', () => {
    const page = paginate(items, new URLSearchParams({ limit: '25' }));
    expect(page.pageInfo.hasMore).toBe(false);
  });
  const emptyPage = { items: [], pageInfo: { nextCursor: null, hasMore: false } };
  it('garbage / forged cursors return an empty page and never throw', () => {
    const forged = [
      '!!!not-base64',
      btoa('does-not-exist'), // valid base64, not JSON
      btoa('{"id":5,"i":1}'), // wrong types
      btoa('{"id":"id01"}'), // missing index
      btoa('{"id":"id01","i":-3}'), // negative index
      btoa('[]'),
      btoa('null'),
    ];
    for (const cursor of forged) {
      expect(paginate(items, new URLSearchParams({ limit: '5', cursor }))).toEqual(emptyPage);
    }
  });
  it('a stale cursor (last returned item deleted) continues without duplicates or gaps', () => {
    const p1 = paginate(items, new URLSearchParams({ limit: '5' }));
    const lastId = p1.items[p1.items.length - 1]!.id; // id04
    const after = items.filter((x) => x.id !== lastId);
    const p2 = paginate(
      after,
      new URLSearchParams({ limit: '5', cursor: p1.pageInfo.nextCursor! }),
    );
    expect(p2.items.map((x) => x.id)).toEqual(['id05', 'id06', 'id07', 'id08', 'id09']);
    const seen = new Set(p1.items.map((x) => x.id));
    expect(p2.items.some((x) => seen.has(x.id))).toBe(false);
  });
  it('a stale cursor past the end of a shrunk list yields an empty final page', () => {
    const p1 = paginate(items, new URLSearchParams({ limit: '20' }));
    const short = items.slice(0, 3);
    const p2 = paginate(short, new URLSearchParams({ cursor: p1.pageInfo.nextCursor! }));
    expect(p2.items).toEqual([]);
    expect(p2.pageInfo).toEqual({ nextCursor: null, hasMore: false });
  });
  it('cursor is base64url (no + / =) so it survives a URL query string', () => {
    // ids chosen so standard base64 of the JSON would contain + / and padding
    const odd = Array.from({ length: 6 }, (_, i) => ({ id: `??>>~~ü${i}` }));
    const p = paginate(odd, new URLSearchParams({ limit: '2' }));
    const cursor = p.pageInfo.nextCursor!;
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
    const roundTripped = new URL(
      `http://x/?${new URLSearchParams({ limit: '2', cursor }).toString()}`,
    ).searchParams;
    expect(paginate(odd, roundTripped).items.map((x) => x.id)).toEqual(
      odd.slice(2, 4).map((x) => x.id),
    );
  });
  it('defaults to 24 and clamps limit to 1..100', () => {
    const many = Array.from({ length: 150 }, (_, i) => ({ id: `x${String(i).padStart(3, '0')}` }));
    expect(paginate(many, new URLSearchParams()).items).toHaveLength(24);
    expect(paginate(many, new URLSearchParams({ limit: '0' })).items).toHaveLength(1);
    expect(paginate(many, new URLSearchParams({ limit: '-5' })).items).toHaveLength(1);
    expect(paginate(many, new URLSearchParams({ limit: '1000' })).items).toHaveLength(100);
    expect(paginate(many, new URLSearchParams({ limit: 'abc' })).items).toHaveLength(24);
    expect(paginate(many, new URLSearchParams(), 10).items).toHaveLength(10);
  });
  it('cursor is opaque base64url of {id,i}; equal sort keys cannot tie', () => {
    const page = paginate(items, new URLSearchParams({ limit: '3' }));
    expect(page.pageInfo.hasMore).toBe(true);
    const padded = page.pageInfo.nextCursor!.replace(/-/g, '+').replace(/_/g, '/');
    expect(JSON.parse(atob(padded))).toEqual({ id: 'id02', i: 2 });
    const tied = [
      { id: 'a', s: 1 },
      { id: 'b', s: 1 },
      { id: 'c', s: 1 },
    ];
    const p1 = paginate(tied, new URLSearchParams({ limit: '1' }));
    const p2 = paginate(tied, new URLSearchParams({ limit: '1', cursor: p1.pageInfo.nextCursor! }));
    expect([p1.items[0].id, p2.items[0].id]).toEqual(['a', 'b']);
  });
});

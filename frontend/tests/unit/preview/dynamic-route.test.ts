import { describe, expect, it } from 'vitest';
import {
  matchDynamicRoute,
  ROUTES,
  compileRoute,
  type DynamicRoute,
} from '@/preview/router/dynamic-route';

const routes: DynamicRoute[] = [
  { route: '/things/[id]', re: /^\/things\/([^/]+)\/?$/, keys: ['id'] },
];

describe('matchDynamicRoute', () => {
  it('matches a pattern and captures params', () => {
    expect(matchDynamicRoute('/things/abc/', routes)).toEqual({
      route: '/things/[id]',
      params: { id: 'abc' },
    });
  });

  it('decodes percent-encoded characters', () => {
    expect(matchDynamicRoute('/things/a%20b', routes)?.params).toEqual({ id: 'a b' });
  });

  it('returns null for a malformed percent sequence instead of throwing', () => {
    expect(matchDynamicRoute('/things/%E0%A4%A', routes)).toBeNull();
  });

  it('returns null when nothing matches', () => {
    expect(matchDynamicRoute('/other/abc/', routes)).toBeNull();
  });
});

describe('compileRoute', () => {
  it('builds a trailing-slash tolerant matcher with one key per [param]', () => {
    const r = compileRoute('/a/[x]/b/[y]');
    expect(r.route).toBe('/a/[x]/b/[y]');
    expect(r.keys).toEqual(['x', 'y']);
    expect(matchDynamicRoute('/a/1/b/2', [r])?.params).toEqual({ x: '1', y: '2' });
    expect(matchDynamicRoute('/a/1/b/2/', [r])?.params).toEqual({ x: '1', y: '2' });
    expect(matchDynamicRoute('/a/1/b', [r])).toBeNull();
  });

  it('escapes regex metacharacters in the static segments', () => {
    const r = compileRoute('/a.b/[id]');
    expect(matchDynamicRoute('/a.b/1', [r])).not.toBeNull();
    expect(matchDynamicRoute('/aXb/1', [r])).toBeNull();
  });
});

describe('ROUTES (real route table)', () => {
  const cases: Array<[string, string, Record<string, string>]> = [
    ['/assets/my-asset', '/assets/[idOrSlug]', { idOrSlug: 'my-asset' }],
    ['/publish/abc123/', '/publish/[id]', { id: 'abc123' }],
    ['/publish/abc123/versions/new', '/publish/[id]/versions/new', { id: 'abc123' }],
    ['/publish/manage/abc123/analytics/', '/publish/manage/[id]/analytics', { id: 'abc123' }],
    ['/admin/assets/a1/edit', '/admin/assets/[id]/edit', { id: 'a1' }],
    ['/admin/reports/r1/', '/admin/reports/[id]', { id: 'r1' }],
    ['/admin/requests/q1', '/admin/requests/[id]', { id: 'q1' }],
    ['/admin/users/u1/', '/admin/users/[id]', { id: 'u1' }],
  ];

  it.each(cases)('%s -> %s', (path, route, params) => {
    expect(matchDynamicRoute(path)).toEqual({ route, params });
  });

  it('declares exactly the eight planned patterns, each with a unique route key', () => {
    expect(ROUTES.map((r) => r.route).sort()).toEqual(cases.map((c) => c[1]).sort());
    expect(new Set(ROUTES.map((r) => r.route)).size).toBe(ROUTES.length);
  });

  it('does not capture /publish/manage/x/analytics with the /publish/[id] family', () => {
    const m = matchDynamicRoute('/publish/manage/x/analytics');
    expect(m?.route).toBe('/publish/manage/[id]/analytics');
    expect(m?.params).toEqual({ id: 'x' });
  });

  it('does not match deeper or unrelated paths', () => {
    expect(matchDynamicRoute('/publish/abc/versions')).toBeNull();
    expect(matchDynamicRoute('/publish/manage/x/other')).toBeNull();
    expect(matchDynamicRoute('/admin/users/u1/extra')).toBeNull();
    expect(matchDynamicRoute('/assets/')).toBeNull();
    expect(matchDynamicRoute('/library')).toBeNull();
  });

  it('decodes encoded ids and returns null for malformed encoding', () => {
    expect(matchDynamicRoute('/assets/a%20b')?.params).toEqual({ idOrSlug: 'a b' });
    expect(matchDynamicRoute('/assets/%E0%A4%A')).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { matchDynamicRoute, type DynamicRoute } from '@/preview/router/dynamic-route';

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

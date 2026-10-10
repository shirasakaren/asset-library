import { describe, it, expect } from 'vitest';
import { homeHref } from '@/preview/navigate';

describe('homeHref', () => {
  it('is "/" at the root path', () => {
    expect(homeHref('')).toBe('/');
  });
  it('prefixes a base path', () => {
    expect(homeHref('/asset-library')).toBe('/asset-library/');
  });
  it('tolerates a trailing slash in the base path', () => {
    expect(homeHref('/asset-library/')).toBe('/asset-library/');
  });
});

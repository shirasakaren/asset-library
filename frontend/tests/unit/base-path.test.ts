import { afterEach, describe, expect, it, vi } from 'vitest';
import { getBasePath, normalizeBasePath, prefixSeedAssetUrls, withBasePath } from '@/lib/base-path';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('normalizeBasePath', () => {
  it('maps empty, blank and "/" to the empty base path', () => {
    for (const raw of [undefined, null, '', '   ', '/', '//']) {
      expect(normalizeBasePath(raw)).toBe('');
    }
  });

  it('adds the leading slash and drops trailing slashes', () => {
    expect(normalizeBasePath('/asset-library')).toBe('/asset-library');
    expect(normalizeBasePath('asset-library')).toBe('/asset-library');
    expect(normalizeBasePath('/asset-library/')).toBe('/asset-library');
    expect(normalizeBasePath(' /a/b// ')).toBe('/a/b');
  });
});

describe('getBasePath', () => {
  it('reads NEXT_PUBLIC_BASE_PATH at call time', () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_PATH', '');
    expect(getBasePath()).toBe('');
    vi.stubEnv('NEXT_PUBLIC_BASE_PATH', '/asset-library/');
    expect(getBasePath()).toBe('/asset-library');
  });
});

describe('withBasePath', () => {
  it('prefixes root-relative URLs', () => {
    expect(withBasePath('/thumbs/a.webp', '/asset-library')).toBe('/asset-library/thumbs/a.webp');
    expect(withBasePath('/brand/mgm-logo.svg', '/asset-library')).toBe(
      '/asset-library/brand/mgm-logo.svg',
    );
    expect(withBasePath('/', '/asset-library')).toBe('/asset-library/');
  });

  it('is idempotent: an already prefixed URL is never prefixed twice', () => {
    const once = withBasePath('/thumbs/a.webp', '/asset-library');
    expect(withBasePath(once, '/asset-library')).toBe(once);
    expect(withBasePath('/asset-library', '/asset-library')).toBe('/asset-library');
    expect(withBasePath('/asset-library?x=1', '/asset-library')).toBe('/asset-library?x=1');
  });

  it('only matches whole path segments of the base path', () => {
    expect(withBasePath('/asset-library-old/x.svg', '/asset-library')).toBe(
      '/asset-library/asset-library-old/x.svg',
    );
  });

  it('leaves everything that is not a root-relative path alone', () => {
    for (const u of [
      'data:image/png;base64,AAAA',
      'blob:http://localhost/abc',
      'preview-blob:42',
      'https://example.com/thumbs/a.webp',
      '//cdn.example.com/a.png',
      'thumbs/a.webp',
      '#hash',
      '',
    ]) {
      expect(withBasePath(u, '/asset-library')).toBe(u);
    }
  });

  it('is a no-op without a base path', () => {
    expect(withBasePath('/thumbs/a.webp', '')).toBe('/thumbs/a.webp');
  });

  it('defaults to the env var', () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_PATH', '/asset-library');
    expect(withBasePath('/patterns/p-1.svg')).toBe('/asset-library/patterns/p-1.svg');
    vi.stubEnv('NEXT_PUBLIC_BASE_PATH', '');
    expect(withBasePath('/patterns/p-1.svg')).toBe('/patterns/p-1.svg');
  });
});

describe('prefixSeedAssetUrls', () => {
  const doc = {
    id: 'a1',
    slug: 'a',
    thumbnail: { key: 'thumbs/a.webp', url: '/thumbs/a.webp' },
    thumbnailSmall: '/thumbs/a-sm.webp',
    previewMedia: [
      { id: 'm1', viewUrl: '/thumbs/a.webp', originalUrl: '/thumbs/a.webp', key: 'thumbs/a.webp' },
    ],
    nested: { deep: [[{ u: '/thumbs/deep.webp' }]] },
    storeUrl: 'https://store.example.com/thumbs/x',
    other: '/library',
    text: 'see /thumbs/a.webp for the cover',
    n: 3,
    nothing: null,
    flag: true,
  };

  it('prefixes only strings that start with /thumbs/, at any depth', () => {
    const out = prefixSeedAssetUrls(doc, '/asset-library');
    expect(out.thumbnail).toEqual({ key: 'thumbs/a.webp', url: '/asset-library/thumbs/a.webp' });
    expect(out.thumbnailSmall).toBe('/asset-library/thumbs/a-sm.webp');
    expect(out.previewMedia[0]).toEqual({
      id: 'm1',
      viewUrl: '/asset-library/thumbs/a.webp',
      originalUrl: '/asset-library/thumbs/a.webp',
      key: 'thumbs/a.webp',
    });
    expect(out.nested.deep[0]![0]!.u).toBe('/asset-library/thumbs/deep.webp');
    // untouched
    expect(out.storeUrl).toBe(doc.storeUrl);
    expect(out.other).toBe('/library');
    expect(out.text).toBe(doc.text);
    expect(out.n).toBe(3);
    expect(out.nothing).toBeNull();
    expect(out.flag).toBe(true);
  });

  it('is idempotent and does not mutate its input', () => {
    const snapshot = structuredClone(doc);
    const once = prefixSeedAssetUrls(doc, '/asset-library');
    expect(doc).toEqual(snapshot);
    expect(prefixSeedAssetUrls(once, '/asset-library')).toEqual(once);
  });

  it('leaves user-created data and blob URLs alone', () => {
    const user = { a: 'data:image/png;base64,AAAA', b: 'preview-blob:7', c: 'blob:http://x/y' };
    expect(prefixSeedAssetUrls(user, '/asset-library')).toEqual(user);
  });

  it('returns the very same value without a base path', () => {
    expect(prefixSeedAssetUrls(doc, '')).toBe(doc);
  });

  it('handles arrays at the top level (a whole collection)', () => {
    const out = prefixSeedAssetUrls([doc, { id: 'b', thumbnailUrl: '/thumbs/b.webp' }], '/x');
    expect(out[1]).toEqual({ id: 'b', thumbnailUrl: '/x/thumbs/b.webp' });
  });
});

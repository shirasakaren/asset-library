/**
 * Base-path helpers for the static preview, which is served either at a host root (custom domain)
 * or under a sub-path (the GitHub project Pages URL, `/asset-library`). The sub-path is
 * `NEXT_PUBLIC_BASE_PATH`, handed to Next's `basePath` at build time.
 *
 * Next's `basePath` already prefixes `next/link`, the router, `_next/` assets and statically
 * imported files. It does NOT prefix a plain string `src` (`<img>`, `next/image` with
 * `unoptimized`), CSS `url()` or metadata URLs, so every URL we emit for a file in `public/`
 * goes through `withBasePath`. The variable is read at call time (Next inlines the literal
 * `process.env.NEXT_PUBLIC_BASE_PATH` at build time) so unit tests can set it.
 */

/** `''` for none or `/`, otherwise `/segment[/segment]` (leading slash, no trailing slash). */
export function normalizeBasePath(raw: string | null | undefined): string {
  const trimmed = (raw ?? '').trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

export function getBasePath(): string {
  return normalizeBasePath(process.env.NEXT_PUBLIC_BASE_PATH);
}

/**
 * Prefixes a root-relative URL (`/thumbs/a.webp`) with the base path. Idempotent: a URL that
 * already starts with the base path (as a whole segment) is returned as is. Anything that is not
 * a root-relative path (`data:`, `blob:`, `preview-blob:`, `https:`, protocol-relative `//`,
 * relative or empty strings) is returned untouched, as is every URL when there is no base path.
 */
export function withBasePath(url: string, basePath: string = getBasePath()): string {
  if (!basePath || !url.startsWith('/') || url.startsWith('//')) return url;
  const next = url.charAt(basePath.length);
  if (url.startsWith(basePath) && (next === '' || next === '/' || next === '?' || next === '#')) {
    return url;
  }
  return `${basePath}${url}`;
}

/**
 * Absolute URL of a `public/` file, for metadata (Open Graph) that crawlers resolve out of
 * context: the origin of `appUrl` plus the base path. Any path inside `appUrl` is ignored so the
 * result never depends on whether `NEXT_PUBLIC_APP_URL` carries the sub-path.
 */
export function absoluteAssetUrl(
  path: string,
  appUrl: string,
  basePath: string = getBasePath(),
): string {
  return `${new URL(appUrl).origin}${withBasePath(path, basePath)}`;
}

const SEED_PREFIX = '/thumbs/';

/**
 * The seed JSON stores the bundled store art as `/thumbs/<slug>.webp` (`thumbnail.url`,
 * `thumbnailSmall`, `previewMedia[].viewUrl`, featured banners...). Walks a seed document or whole
 * collection and gives every string that starts with `/thumbs/` the base path, so the handlers
 * hand out URLs that resolve under the sub-path. Pure and idempotent; strings elsewhere (data /
 * blob URLs, `thumbs/<slug>.webp` keys, sentences) are left alone. Without a base path the very
 * same value comes back, no copy.
 */
export function prefixSeedAssetUrls<T>(value: T, basePath: string = getBasePath()): T {
  if (!basePath) return value;
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return v.startsWith(SEED_PREFIX) ? withBasePath(v, basePath) : v;
    if (Array.isArray(v)) return v.map(walk);
    if (v !== null && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v)) out[k] = walk(x);
      return out;
    }
    return v;
  };
  return walk(value) as T;
}

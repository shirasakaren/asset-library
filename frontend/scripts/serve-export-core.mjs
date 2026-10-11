// Request routing for scripts/serve-export.mjs, kept free of any server so tests can drive it.
//
// The static export is hosted on GitHub Pages in one of two shapes:
//   - at a host root (custom domain): every path belongs to the site;
//   - under a project sub-path (https://<owner>.github.io/<repo>/): only paths below `/<repo>/`
//     belong to the site. `/<repo>` redirects to `/<repo>/`; anything else on that host is a
//     different site, which for our purposes is "not found" (the 404 shell).
// `prefix` is that sub-path ('' for the root); `out/` is mounted under it.
import fs from 'node:fs';
import path from 'node:path';

/** `''` for none or `/`, otherwise `/segment[/segment]` (leading slash, no trailing slash). */
export function normalizePrefix(raw) {
  const trimmed = String(raw ?? '')
    .trim()
    .replace(/\/+$/, '');
  if (!trimmed) return '';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

/** `[dir] [port] [base]` positionals plus `--base <prefix>` / `--base=<prefix>` anywhere. */
export function parseArgs(argv) {
  const positional = [];
  let base;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--base') {
      base = argv[++i];
    } else if (a.startsWith('--base=')) {
      base = a.slice('--base='.length);
    } else {
      positional.push(a);
    }
  }
  const [dir = 'out', port = '4317', third] = positional;
  return { dir, port, prefix: normalizePrefix(base ?? third) };
}

/**
 * Where a request path lies relative to the prefix.
 * `{ kind: 'inside', rest }` (`rest` starts with `/`), `{ kind: 'redirect' }` for the bare prefix,
 * `{ kind: 'outside' }` for anything else. Matches whole segments only: `/app-old/x` is outside `/app`.
 */
export function matchPrefix(pathname, prefix) {
  if (!prefix) return { kind: 'inside', rest: pathname };
  if (pathname === prefix) return { kind: 'redirect' };
  if (pathname.startsWith(`${prefix}/`)) return { kind: 'inside', rest: pathname.slice(prefix.length) };
  return { kind: 'outside' };
}

/** The file for a decoded, prefix-less path, or null. It must stay inside `root` (also not a sibling like "out-secret"). */
export function resolveFile(root, restPath) {
  const candidates = [restPath, path.join(restPath, 'index.html'), restPath + '.html'];
  for (const c of candidates) {
    const f = path.join(root, c);
    if (f !== root && !f.startsWith(root + path.sep)) continue;
    if (fs.existsSync(f) && fs.statSync(f).isFile()) return f;
  }
  return null;
}

/**
 * Decides what to answer for a request URL (as sent: path plus optional query).
 * - `{ type: 'bad-request' }`: malformed percent-encoding;
 * - `{ type: 'redirect', status: 301, location }`: `/<prefix>` -> `/<prefix>/` (query kept);
 * - `{ type: 'file', status: 200, file }`;
 * - `{ type: 'not-found', status: 404, file }`: serve the 404 shell `file` (null: no 404.html in the export),
 *   for unknown paths below the prefix and for every path outside it.
 */
export function route(rawUrl, { root, prefix = '' }) {
  const q = rawUrl.indexOf('?');
  const rawPath = q >= 0 ? rawUrl.slice(0, q) : rawUrl;
  const search = q >= 0 ? rawUrl.slice(q) : '';
  const notFound = () => {
    const shell = path.join(root, '404.html');
    return { type: 'not-found', status: 404, file: fs.existsSync(shell) ? shell : null };
  };

  const m = matchPrefix(rawPath, prefix);
  if (m.kind === 'redirect') {
    return { type: 'redirect', status: 301, location: `${prefix}/${search}` };
  }
  if (m.kind === 'outside') return notFound();

  let rest;
  try {
    rest = decodeURIComponent(m.rest);
  } catch {
    return { type: 'bad-request' };
  }
  const file = resolveFile(root, rest);
  return file ? { type: 'file', status: 200, file } : notFound();
}

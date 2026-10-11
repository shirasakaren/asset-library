export interface DynamicMatch {
  route: string;
  params: Record<string, string>;
}
export interface DynamicRoute {
  route: string;
  re: RegExp;
  keys: string[];
}
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Compiles a Next-style pattern such as `/publish/[id]/versions/new` (trailing slash tolerated). */
export function compileRoute(route: string): DynamicRoute {
  const keys: string[] = [];
  const src = route
    .split('/')
    .map((seg) => {
      const m = /^\[([A-Za-z0-9_]+)\]$/.exec(seg);
      if (!m) return escapeRe(seg);
      keys.push(m[1]!);
      return '([^/]+)';
    })
    .join('/');
  return { route, re: new RegExp(`^${src}/?$`), keys };
}

/**
 * Every dynamic page of the app. Each pattern is anchored on both ends, so
 * `/publish/manage/x/analytics` can never be captured by `/publish/[id]`;
 * specific patterns are still listed first as a guard against future edits.
 */
export const ROUTES: DynamicRoute[] = [
  '/publish/manage/[id]/analytics',
  '/publish/[id]/versions/new',
  '/publish/[id]',
  '/assets/[idOrSlug]',
  '/admin/assets/[id]/edit',
  '/admin/reports/[id]',
  '/admin/requests/[id]',
  '/admin/users/[id]',
].map(compileRoute);

/** Returns null when nothing matches or the URL has a malformed %-sequence. */
export function matchDynamicRoute(
  pathname: string,
  routes: DynamicRoute[] = ROUTES,
): DynamicMatch | null {
  for (const r of routes) {
    const m = r.re.exec(pathname);
    if (!m) continue;
    try {
      return {
        route: r.route,
        params: Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1]!)])),
      };
    } catch {
      return null;
    }
  }
  return null;
}

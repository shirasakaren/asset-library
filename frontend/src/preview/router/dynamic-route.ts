export interface DynamicMatch {
  route: string;
  params: Record<string, string>;
}
export interface DynamicRoute {
  route: string;
  re: RegExp;
  keys: string[];
}
// Real routes are registered in Task 5 (e.g. '/assets/[idOrSlug]').
const ROUTES: DynamicRoute[] = [];

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

export interface DynamicMatch {
  route: string;
  params: Record<string, string>;
}
// Real routes are registered in Task 5 (e.g. '/assets/[idOrSlug]').
const ROUTES: { route: string; re: RegExp; keys: string[] }[] = [];
export function matchDynamicRoute(pathname: string): DynamicMatch | null {
  for (const r of ROUTES) {
    const m = r.re.exec(pathname);
    if (m)
      return {
        route: r.route,
        params: Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1]!)])),
      };
  }
  return null;
}

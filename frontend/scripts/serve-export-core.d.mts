export function normalizePrefix(raw: string | null | undefined): string;
export function parseArgs(argv: string[]): { dir: string; port: string; prefix: string };
export function matchPrefix(
  pathname: string,
  prefix: string,
): { kind: 'inside'; rest: string } | { kind: 'redirect' } | { kind: 'outside' };
export function resolveFile(root: string, restPath: string): string | null;
export type RouteResult =
  | { type: 'bad-request' }
  | { type: 'redirect'; status: 301; location: string }
  | { type: 'file'; status: 200; file: string }
  | { type: 'not-found'; status: 404; file: string | null };
export function route(rawUrl: string, opts: { root: string; prefix?: string }): RouteResult;

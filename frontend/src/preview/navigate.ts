/** `/` under the configured base path (`NEXT_PUBLIC_BASE_PATH`, empty at the domain root). */
export function homeHref(basePath: string): string {
  return `${basePath.replace(/\/+$/, '')}/`;
}

/** Full page load of the home page, so every in-memory singleton (db, caches) starts fresh. */
export function goHomeWithReload(): void {
  window.location.assign(homeHref(process.env.NEXT_PUBLIC_BASE_PATH ?? ''));
}

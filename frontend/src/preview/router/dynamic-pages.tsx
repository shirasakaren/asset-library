'use client';

import { lazy, type ComponentType } from 'react';

/** URL params captured by `matchDynamicRoute` (already percent-decoded). */
export type DynamicParams = Record<string, string>;

/** What the exported `not-found` shell renders for a matched route. */
export type DynamicPage = ComponentType<{ params: DynamicParams }>;

/**
 * Adapts a lazily loaded page component and the route params to a `DynamicPage`.
 * The page is code-split, so the 404 shell only downloads the page it renders.
 */
function lazyPage<P extends object>(
  load: () => Promise<ComponentType<P>>,
  toProps: (params: DynamicParams) => P,
): DynamicPage {
  const Lazy = lazy(async () => ({ default: await load() })) as unknown as ComponentType<P>;
  return function DynamicPageEntry({ params }) {
    const props = toProps(params);
    return <Lazy {...props} />;
  };
}

/**
 * Route key (a pattern from `ROUTES` in `./dynamic-route`) -> client page.
 * Adding a dynamic page is one line:
 *
 *   '/publish/[id]': lazyPage(
 *     () => import('@/components/publish/x').then((m) => m.XPageClient),
 *     (p) => ({ id: p.id! }),
 *   ),
 *
 * The shell wraps every entry in `AppShell`. Pages that live under a nested
 * layout (e.g. `/admin/*`) must bring that layout themselves in their client
 * component. A route with no entry falls back to the 404 view.
 */
const PAGES: Record<string, DynamicPage | undefined> = {
  '/assets/[idOrSlug]': lazyPage(
    () =>
      import('@/components/asset/asset-detail-page-client').then((m) => m.AssetDetailPageClient),
    (p) => ({ idOrSlug: p.idOrSlug ?? '' }),
  ),
};

export function getDynamicPage(route: string): DynamicPage | null {
  return Object.hasOwn(PAGES, route) ? (PAGES[route] ?? null) : null;
}

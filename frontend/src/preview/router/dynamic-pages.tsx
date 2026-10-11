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
 * Like `lazyPage`, for `/admin/*` pages: the page body is rendered inside the shared admin
 * chrome (`AdminChrome`: sidebar + admin gate), which the 404 shell does not provide.
 */
function adminLazyPage<P extends object>(
  load: () => Promise<ComponentType<P>>,
  toProps: (params: DynamicParams) => P,
): DynamicPage {
  return lazyPage(async () => {
    const [Page, chrome] = await Promise.all([load(), import('@/components/admin/admin-chrome')]);
    return chrome.withAdminChrome(Page);
  }, toProps);
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
 * layout (e.g. `/admin/*`) must bring that layout themselves (`adminLazyPage`). A route with no entry falls back to the 404 view.
 */
const PAGES: Record<string, DynamicPage | undefined> = {
  '/assets/[idOrSlug]': lazyPage(
    () =>
      import('@/components/asset/asset-detail-page-client').then((m) => m.AssetDetailPageClient),
    (p) => ({ idOrSlug: p.idOrSlug ?? '' }),
  ),
  '/publish/[id]': lazyPage(
    () =>
      import('@/components/publish/publish-wizard-page-client').then(
        (m) => m.PublishWizardPageClient,
      ),
    (p) => ({ id: p.id ?? '' }),
  ),
  '/publish/[id]/versions/new': lazyPage(
    () =>
      import('@/components/publish/new-version-page-client').then((m) => m.NewVersionPageClient),
    (p) => ({ id: p.id ?? '' }),
  ),
  '/publish/manage/[id]/analytics': lazyPage(
    () => import('@/components/publish/analytics-page-client').then((m) => m.AnalyticsPageClient),
    (p) => ({ id: p.id ?? '' }),
  ),
  '/admin/assets/[id]/edit': adminLazyPage(
    () =>
      import('@/components/admin/asset-edit-page-client').then((m) => m.AdminAssetEditPageClient),
    (p) => ({ id: p.id ?? '' }),
  ),
  '/admin/reports/[id]': adminLazyPage(
    () =>
      import('@/components/admin/report-detail-page-client').then((m) => m.AdminReportPageClient),
    (p) => ({ id: p.id ?? '' }),
  ),
  '/admin/requests/[id]': adminLazyPage(
    () =>
      import('@/components/admin/request-detail-page-client').then((m) => m.AdminRequestPageClient),
    (p) => ({ id: p.id ?? '' }),
  ),
  '/admin/users/[id]': adminLazyPage(
    () => import('@/components/admin/user-detail-page-client').then((m) => m.AdminUserPageClient),
    (p) => ({ id: p.id ?? '' }),
  ),
};

export function getDynamicPage(route: string): DynamicPage | null {
  return Object.hasOwn(PAGES, route) ? (PAGES[route] ?? null) : null;
}

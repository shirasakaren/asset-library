import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderRaw } from '../../helpers/render';

const pathname = vi.hoisted(() => ({ value: '/' }));
const hidden = vi.hoisted(() => ({ route: null as string | null }));
const meState = vi.hoisted(() => ({ id: 'u1', isAdmin: true }));

vi.mock('next/navigation', () => ({
  usePathname: () => pathname.value,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/preview/session/me-provider', () => ({ useMe: () => meState }));
vi.mock('@/components/admin/admin-sidebar', () => ({
  AdminSidebar: () => <nav data-testid="admin-sidebar" />,
}));
// Lets a test pretend a matched route has no registered page.
vi.mock('@/preview/router/dynamic-pages', async (importActual) => {
  const actual = await importActual<typeof import('@/preview/router/dynamic-pages')>();
  return {
    ...actual,
    getDynamicPage: (route: string) =>
      route === hidden.route ? null : actual.getDynamicPage(route),
  };
});
vi.mock('@/components/layout/app-shell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="app-shell">{children}</div>
  ),
}));
vi.mock('@/components/asset/asset-detail-page-client', () => ({
  AssetDetailPageClient: ({ idOrSlug }: { idOrSlug: string }) => (
    <div data-testid="asset-page">asset:{idOrSlug}</div>
  ),
}));

vi.mock('@/components/publish/publish-wizard-page-client', () => ({
  PublishWizardPageClient: ({ id }: { id: string }) => <div>wizard:{id}</div>,
}));
vi.mock('@/components/publish/new-version-page-client', () => ({
  NewVersionPageClient: ({ id }: { id: string }) => <div>new-version:{id}</div>,
}));
vi.mock('@/components/publish/analytics-page-client', () => ({
  AnalyticsPageClient: ({ id }: { id: string }) => <div>analytics:{id}</div>,
}));
vi.mock('@/components/admin/asset-edit-page-client', () => ({
  AdminAssetEditPageClient: ({ id }: { id: string }) => <div>admin-edit:{id}</div>,
}));
vi.mock('@/components/admin/report-detail-page-client', () => ({
  AdminReportPageClient: ({ id }: { id: string }) => <div>admin-report:{id}</div>,
}));
vi.mock('@/components/admin/request-detail-page-client', () => ({
  AdminRequestPageClient: ({ id }: { id: string }) => <div>admin-request:{id}</div>,
}));
vi.mock('@/components/admin/user-detail-page-client', () => ({
  AdminUserPageClient: ({ id }: { id: string }) => <div>admin-user:{id}</div>,
}));

import NotFound from '@/app/not-found';

describe('not-found shell', () => {
  beforeEach(() => {
    pathname.value = '/';
    hidden.route = null;
    meState.isAdmin = true;
    document.title = '';
  });

  it('renders the registered page, inside the app shell, for a matched dynamic route', async () => {
    pathname.value = '/assets/brand-new-slug/';
    renderRaw(<NotFound />);
    expect(await screen.findByText('asset:brand-new-slug')).toBeInTheDocument();
    expect(screen.getByTestId('app-shell')).toContainElement(screen.getByTestId('asset-page'));
    expect(screen.queryByText('notFound.title')).not.toBeInTheDocument();
  });

  it.each([
    ['/publish/new-asset-1/', 'wizard:new-asset-1'],
    ['/publish/new-asset-1/versions/new', 'new-version:new-asset-1'],
    ['/publish/manage/new-asset-1/analytics/', 'analytics:new-asset-1'],
  ])('renders the publish page registered for %s inside the app shell', async (path, text) => {
    pathname.value = path;
    renderRaw(<NotFound />);
    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(screen.getByTestId('app-shell')).toContainElement(screen.getByText(text));
    expect(screen.queryByText('notFound.title')).not.toBeInTheDocument();
  });

  it.each([
    ['/admin/assets/new-asset-1/edit', 'admin-edit:new-asset-1'],
    ['/admin/reports/new-report-1/', 'admin-report:new-report-1'],
    ['/admin/requests/new-request-1', 'admin-request:new-request-1'],
    ['/admin/users/new-user-1/', 'admin-user:new-user-1'],
  ])(
    'renders the admin page registered for %s inside the app shell AND the admin chrome',
    async (path, text) => {
      pathname.value = path;
      renderRaw(<NotFound />);
      expect(await screen.findByText(text)).toBeInTheDocument();
      expect(screen.getByTestId('app-shell')).toContainElement(screen.getByTestId('admin-sidebar'));
      expect(screen.getByTestId('app-shell')).toContainElement(screen.getByText(text));
      expect(screen.queryByText('notFound.title')).not.toBeInTheDocument();
    },
  );

  it('shows the 403 content instead of a runtime-created admin page to a non-admin', async () => {
    meState.isAdmin = false;
    pathname.value = '/admin/users/new-user-1/';
    renderRaw(<NotFound />);
    expect(await screen.findByText("You don't have access to that page.")).toBeInTheDocument();
    expect(screen.queryByText('admin-user:new-user-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('admin-sidebar')).not.toBeInTheDocument();
  });

  it('decodes route params before handing them to the page', async () => {
    pathname.value = '/assets/a%20b';
    renderRaw(<NotFound />);
    expect(await screen.findByText('asset:a b')).toBeInTheDocument();
  });

  it('falls back to the 404 UI (never blank) when the route matches but has no registered page', async () => {
    pathname.value = '/publish/x1/';
    hidden.route = '/publish/[id]';
    renderRaw(<NotFound />);
    expect(await screen.findByText('notFound.title')).toBeInTheDocument();
    expect(screen.queryByTestId('app-shell')).not.toBeInTheDocument();
  });

  it('renders the 404 UI and a page title for an unknown URL', async () => {
    pathname.value = '/nope/at/all';
    renderRaw(<NotFound />);
    expect(await screen.findByText('notFound.title')).toBeInTheDocument();
    await waitFor(() => expect(document.title).toMatch(/^Page not found — /));
  });
});

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderRaw } from '../../helpers/render';

const pathname = vi.hoisted(() => ({ value: '/' }));

vi.mock('next/navigation', () => ({
  usePathname: () => pathname.value,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
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

import NotFound from '@/app/not-found';

describe('not-found shell', () => {
  beforeEach(() => {
    pathname.value = '/';
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

  it('decodes route params before handing them to the page', async () => {
    pathname.value = '/assets/a%20b';
    renderRaw(<NotFound />);
    expect(await screen.findByText('asset:a b')).toBeInTheDocument();
  });

  it('falls back to the 404 UI (never blank) when the route matches but has no registered page', async () => {
    pathname.value = '/admin/users/u1/';
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

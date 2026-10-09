import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { renderWithProviders } from '../../helpers/render';
import { ApiError } from '@/lib/api/errors';
import { queryKeys } from '@/lib/api/queries';

const fetchApi = vi.hoisted(() => vi.fn());
const warn = vi.hoisted(() => vi.fn());
const meState = vi.hoisted(() => ({ id: 'me-1', isAdmin: false }));

vi.mock('@/lib/api/client', () => ({ useAuthedFetch: () => fetchApi }));
vi.mock('@/lib/logger', () => ({
  logger: { warn, info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/preview/session/me-provider', () => ({
  useMe: () => ({ id: meState.id, isAdmin: meState.isAdmin, displayName: 'Me' }),
}));
vi.mock('@/components/asset/asset-card', () => ({
  AssetCard: ({ asset, href }: { asset: { title: string }; href: string }) => (
    <a href={href}>card:{asset.title}</a>
  ),
}));
vi.mock('@/components/asset/thumbnail-image', () => ({ ThumbnailImage: () => null }));
vi.mock('@/components/publish/manage-actions', () => ({
  ManageActions: ({ asset }: { asset: { id: string } }) => <span>actions:{asset.id}</span>,
}));
vi.mock('@/components/publish/wizard', () => ({
  PublishWizard: ({ initialAsset }: { initialAsset: { title: string } }) => (
    <div data-testid="wizard">{initialAsset.title}</div>
  ),
}));
vi.mock('@/components/publish/new-version-form', () => ({
  NewVersionForm: ({ asset }: { asset: { title: string } }) => (
    <div data-testid="new-version">{asset.title}</div>
  ),
}));
vi.mock('@/components/publish/analytics-charts.lazy', () => ({
  AnalyticsCharts: ({ data }: { data: { label: string } }) => (
    <div data-testid="charts">{data.label}</div>
  ),
}));

import { PublishLandingPageClient } from '@/components/publish/publish-landing-page-client';
import { PublishManagePageClient } from '@/components/publish/publish-manage-page-client';
import { PublishWizardPageClient } from '@/components/publish/publish-wizard-page-client';
import { NewVersionPageClient } from '@/components/publish/new-version-page-client';
import { AnalyticsPageClient } from '@/components/publish/analytics-page-client';

const problem = (status: number) => ({
  type: 'about:blank',
  title: 'x',
  status,
  code: status === 404 ? 'NOT_FOUND' : 'INTERNAL',
});
const asset = (over: Record<string, unknown> = {}) => ({
  id: 'a1',
  title: 'Asset One',
  status: 'PUBLISHED',
  thumbnailUrl: null,
  updatedAt: '2026-03-01T00:00:00.000Z',
  totalDownloads: 1200,
  totalSaves: 30,
  ...over,
});
const page = (items: unknown[]) => ({ items, pageInfo: { nextCursor: null, hasMore: false } });

beforeEach(() => {
  fetchApi.mockReset();
  warn.mockReset();
  meState.id = 'me-1';
  meState.isAdmin = false;
});

describe('PublishLandingPageClient', () => {
  it('shows a skeleton, then drafts and published assets for the current user', async () => {
    fetchApi.mockResolvedValue(
      page([
        asset({ id: 'd1', title: 'Draft One', status: 'DRAFT' }),
        asset({ id: 'p1', title: 'Pub One' }),
        asset({ id: 'x1', title: 'Archived', status: 'ARCHIVED' }),
      ]),
    );
    renderWithProviders(<PublishLandingPageClient />);
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    expect(await screen.findByText('Draft One')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'card:Pub One' })).toHaveAttribute(
      'href',
      '/publish/p1',
    );
    expect(screen.queryByText('Archived')).not.toBeInTheDocument();
    expect(fetchApi).toHaveBeenCalledWith('/assets', {
      query: { ownerId: 'me-1', includeUnpublished: 'true', limit: 50 },
    });
  });

  it('shows the empty state when the user has nothing', async () => {
    fetchApi.mockResolvedValue(page([]));
    renderWithProviders(<PublishLandingPageClient />);
    expect(await screen.findByText('publish.empty.title')).toBeInTheDocument();
  });

  it('treats a failed list as the empty state and logs it', async () => {
    fetchApi.mockRejectedValue(new Error('boom'));
    renderWithProviders(<PublishLandingPageClient />);
    expect(await screen.findByText('publish.empty.title')).toBeInTheDocument();
    expect(warn).toHaveBeenCalledWith('publish.fetch-failed', { path: '/assets', err: 'boom' });
  });
});

describe('PublishManagePageClient', () => {
  it('shows a skeleton, then totals and a row per asset', async () => {
    fetchApi.mockResolvedValue(
      page([asset(), asset({ id: 'd1', title: 'Draft One', status: 'DRAFT', totalDownloads: 0 })]),
    );
    renderWithProviders(<PublishManagePageClient />);
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    expect(await screen.findByText('Asset One')).toBeInTheDocument();
    expect(screen.getByText('actions:d1')).toBeInTheDocument();
    expect(screen.getByText('1,200')).toBeInTheDocument();
    expect(fetchApi).toHaveBeenCalledWith('/assets', {
      query: { ownerId: 'me-1', includeUnpublished: 'true', limit: 100, sort: 'recentlyUpdated' },
    });
  });

  it('renders zero totals when the list fails, and logs it', async () => {
    fetchApi.mockRejectedValue(new Error('down'));
    renderWithProviders(<PublishManagePageClient />);
    expect(await screen.findByText('publish.manageView.totalsDownloads')).toBeInTheDocument();
    expect(screen.queryByText(/^actions:/)).not.toBeInTheDocument();
    expect(warn).toHaveBeenCalledWith('publish-manage.fetch-failed', {
      path: '/assets',
      err: 'down',
    });
  });
});

describe.each([
  ['PublishWizardPageClient', PublishWizardPageClient, 'wizard'],
  ['NewVersionPageClient', NewVersionPageClient, 'new-version'],
] as const)('%s', (_name, Page, testId) => {
  it('shows a skeleton, then the body for the asset owner (drafts included)', async () => {
    fetchApi.mockResolvedValue({ ...asset(), owner: { id: 'me-1' } });
    renderWithProviders(<Page id="a1" />);
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    expect(await screen.findByTestId(testId)).toHaveTextContent('Asset One');
    expect(fetchApi).toHaveBeenCalledWith('/assets/a1', {
      query: { locale: 'en', includeUnpublished: 'true' },
    });
  });

  it('lets an admin through for someone else asset', async () => {
    meState.isAdmin = true;
    fetchApi.mockResolvedValue({ ...asset(), owner: { id: 'other' } });
    renderWithProviders(<Page id="a1" />);
    expect(await screen.findByTestId(testId)).toBeInTheDocument();
  });

  it('shows the 404 view for someone else asset', async () => {
    fetchApi.mockResolvedValue({ ...asset(), owner: { id: 'other' } });
    renderWithProviders(<Page id="a1" />);
    expect(await screen.findByText('notFound.title')).toBeInTheDocument();
    expect(screen.queryByTestId(testId)).not.toBeInTheDocument();
  });

  it('shows the 404 view when the asset does not exist', async () => {
    fetchApi.mockRejectedValue(new ApiError(problem(404)));
    renderWithProviders(<Page id="missing" />);
    expect(await screen.findByText('notFound.title')).toBeInTheDocument();
  });

  it('shows a retryable error view for other failures', async () => {
    fetchApi.mockRejectedValueOnce(new ApiError(problem(500)));
    renderWithProviders(<Page id="a1" />);
    expect(await screen.findByText('errors.boundaryTitle')).toBeInTheDocument();
    expect(screen.queryByText('notFound.title')).not.toBeInTheDocument();
    fetchApi.mockResolvedValue({ ...asset(), owner: { id: 'me-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'errors.tryAgain' }));
    expect(await screen.findByTestId(testId)).toBeInTheDocument();
  });

  it('url-encodes the id in the request path', async () => {
    fetchApi.mockResolvedValue({ ...asset(), owner: { id: 'me-1' } });
    renderWithProviders(<Page id="a b/c" />);
    await screen.findByTestId(testId);
    expect(fetchApi.mock.calls[0]![0]).toBe('/assets/a%20b%2Fc');
  });
});

describe('AnalyticsPageClient', () => {
  it('shows a skeleton, then the charts', async () => {
    fetchApi.mockResolvedValue({ label: 'series' });
    renderWithProviders(<AnalyticsPageClient id="a1" />);
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    expect(await screen.findByTestId('charts')).toHaveTextContent('series');
    expect(fetchApi).toHaveBeenCalledWith('/me/analytics/assets/a1');
  });

  it('renders the empty card (non-fatal) when analytics fail to load, and logs it', async () => {
    fetchApi.mockRejectedValue(new ApiError(problem(404)));
    renderWithProviders(<AnalyticsPageClient id="missing" />);
    expect(await screen.findByText('No analytics data available yet.')).toBeInTheDocument();
    expect(screen.queryByTestId('charts')).not.toBeInTheDocument();
    await waitFor(() => expect(warn).toHaveBeenCalled());
  });
});

describe('list invalidation used by ManageActions', () => {
  it('the bare publishManageList()/assets() keys prefix-match every filtered list', () => {
    const client = new QueryClient();
    const manage = queryKeys.publishManageList({ scope: 'manage', ownerId: 'me-1' });
    const landing = queryKeys.publishManageList({ scope: 'landing', ownerId: 'me-1' });
    const assets = queryKeys.assets({ ownerId: 'me-1' });
    for (const key of [manage, landing, assets]) client.setQueryData(key, page([]));
    void client.invalidateQueries({ queryKey: queryKeys.publishManageList() });
    void client.invalidateQueries({ queryKey: queryKeys.assets() });
    for (const key of [manage, landing, assets]) {
      expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    }
  });
});

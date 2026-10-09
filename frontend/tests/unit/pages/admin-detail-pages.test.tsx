import { act, fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../helpers/render';
import { ApiError } from '@/lib/api/errors';
import { queryKeys } from '@/lib/api/queries';

const fetchApi = vi.hoisted(() => vi.fn());
const meState = vi.hoisted(() => ({ id: 'admin-1', isAdmin: true, displayName: 'Ada Admin' }));

vi.mock('@/lib/api/client', () => ({ useAuthedFetch: () => fetchApi }));
vi.mock('@/preview/session/me-provider', () => ({ useMe: () => meState }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/admin',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/components/admin/report-decision-form', () => ({
  ReportDecisionForm: ({ report }: { report: { id: string } }) => (
    <div>report-form:{report.id}</div>
  ),
}));
vi.mock('@/components/admin/request-decision-form', () => ({
  RequestDecisionForm: ({ request }: { request: { id: string } }) => (
    <div>request-form:{request.id}</div>
  ),
}));
vi.mock('@/components/admin/dashboard-charts.lazy', () => ({
  DashboardCharts: () => <div data-testid="charts" />,
}));
vi.mock('@/components/publish/wizard', () => ({
  PublishWizard: ({ initialAsset }: { initialAsset: { title: string } }) => (
    <div data-testid="wizard">wizard:{initialAsset.title}</div>
  ),
}));

import { AdminDashboardPageClient } from '@/components/admin/dashboard-page-client';
import { AdminReportPageClient } from '@/components/admin/report-detail-page-client';
import { AdminRequestPageClient } from '@/components/admin/request-detail-page-client';
import { AdminUserPageClient } from '@/components/admin/user-detail-page-client';
import { AdminAssetEditPageClient } from '@/components/admin/asset-edit-page-client';

const problem = (status: number) => ({
  type: 'about:blank',
  title: 'x',
  status,
  code: status === 404 ? 'NOT_FOUND' : 'INTERNAL',
});
/** Lets React Query's batched notifications reach the component before asserting. */
const flush = () => act(async () => new Promise((r) => setTimeout(r, 20)));

const report = {
  id: 'r1234567890',
  status: 'OPEN',
  createdAt: '2026-01-01T00:00:00.000Z',
  resolvedAt: null,
  reporter: { displayName: 'Rita Reporter' },
  assetId: 'a1',
  assetSlug: 'cool-asset',
  assetTitle: 'Cool Asset',
  category: 'MALICIOUS_FILE',
  notes: 'looks bad',
};
const request = {
  id: 'q1234567890',
  status: 'PENDING',
  createdAt: '2026-01-01T00:00:00.000Z',
  requester: { displayName: 'Quinn Requester' },
  assetLink: 'https://example.com/x',
  assetType: 'Plugin',
  intendedUse: 'testing',
  price: null,
  notes: null,
};
const user = {
  id: 'u1',
  displayName: 'Una User',
  joinedAt: '2026-01-01T00:00:00.000Z',
  publishedAssetCount: 3,
  email: 'una@example.com',
};
const dashboard = {
  counts: {
    users: 42,
    publishedAssets: 7,
    draftAssets: 1,
    archivedAssets: 0,
    downloads30d: 5,
    pendingReports: 0,
    pendingRequests: 0,
    avInfected: 0,
  },
  charts: { downloads30d: [], publishes30d: [], newUsers30d: [] },
  storage: { byBucket: [] },
  topAssets7d: [],
  recentAudit: [],
};

beforeEach(() => {
  fetchApi.mockReset();
  meState.isAdmin = true;
});

describe('AdminDashboardPageClient', () => {
  it('shows a skeleton, then the counts; loads under queryKeys.adminDashboard', async () => {
    fetchApi.mockResolvedValue(dashboard);
    const { client } = renderWithProviders(<AdminDashboardPageClient />);
    expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument();
    expect(await screen.findByText('Users')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByTestId('charts')).toBeInTheDocument();
    expect(client.getQueryData(queryKeys.adminDashboard)).toEqual(dashboard);
    expect(fetchApi).toHaveBeenCalledWith('/admin/dashboard');
  });

  it('a failed load renders zeroed counts (non-fatal), as the server page did', async () => {
    fetchApi.mockRejectedValue(new ApiError(problem(500)));
    renderWithProviders(<AdminDashboardPageClient />);
    expect(await screen.findByText('Users')).toBeInTheDocument();
    expect(screen.getByText('No recent activity.')).toBeInTheDocument();
  });
});

describe.each([
  {
    name: 'AdminReportPageClient',
    render: () => <AdminReportPageClient id="r1234567890" />,
    key: () => queryKeys.adminReport('r1234567890'),
    path: '/admin/reports/r1234567890',
    data: report,
    text: 'report-form:r1234567890',
  },
  {
    name: 'AdminRequestPageClient',
    render: () => <AdminRequestPageClient id="q1234567890" />,
    key: () => queryKeys.adminAssetRequest('q1234567890'),
    path: '/admin/asset-requests/q1234567890',
    data: request,
    text: 'request-form:q1234567890',
  },
  {
    name: 'AdminUserPageClient',
    render: () => <AdminUserPageClient id="u1" />,
    key: () => queryKeys.adminUser('u1'),
    path: '/users/u1',
    data: user,
    text: 'una@example.com',
  },
])('$name', ({ render, key, path, data, text }) => {
  it('shows a skeleton, then the record, under the right query key and path', async () => {
    fetchApi.mockResolvedValue(data);
    const { client } = renderWithProviders(render());
    expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument();
    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(client.getQueryData(key())).toEqual(data);
    expect(fetchApi).toHaveBeenCalledWith(path);
  });

  it('renders the 404 view for a missing record', async () => {
    fetchApi.mockRejectedValue(new ApiError(problem(404)));
    renderWithProviders(render());
    expect(await screen.findByText('notFound.title')).toBeInTheDocument();
    expect(screen.queryByText(text)).not.toBeInTheDocument();
  });

  it('renders a retryable error for other failures, and retry recovers', async () => {
    fetchApi.mockRejectedValueOnce(new ApiError(problem(500)));
    renderWithProviders(render());
    expect(await screen.findByText('errors.boundaryTitle')).toBeInTheDocument();
    fetchApi.mockResolvedValue(data);
    fireEvent.click(screen.getByRole('button', { name: 'errors.tryAgain' }));
    expect(await screen.findByText(text)).toBeInTheDocument();
  });

  it('keeps the record when a BACKGROUND refetch fails (data + error coexist)', async () => {
    fetchApi.mockResolvedValue(data);
    const { client } = renderWithProviders(render());
    await screen.findByText(text);
    fetchApi.mockRejectedValue(new ApiError(problem(500)));
    await act(async () => {
      await client.invalidateQueries({ queryKey: key() });
    });
    await flush();
    expect(client.getQueryState(key())?.status).toBe('error');
    expect(screen.getByText(text)).toBeInTheDocument();
    expect(screen.queryByText('errors.boundaryTitle')).not.toBeInTheDocument();
  });
});

describe('admin detail ids', () => {
  it('url-encodes the id in the request path', async () => {
    fetchApi.mockResolvedValue(user);
    renderWithProviders(<AdminUserPageClient id="a b/c" />);
    await screen.findByText('una@example.com');
    expect(fetchApi).toHaveBeenCalledWith('/users/a%20b%2Fc');
  });
});

describe('AdminAssetEditPageClient', () => {
  const asset = { id: 'a1', title: 'Asset One', owner: { id: 'u9', displayName: 'Olive Owner' } };

  it('loads the asset (drafts included) under queryKeys.asset and edits on behalf of its owner', async () => {
    fetchApi.mockResolvedValue(asset);
    const { client } = renderWithProviders(<AdminAssetEditPageClient id="a1" />);
    expect(await screen.findByTestId('wizard')).toHaveTextContent('wizard:Asset One');
    expect(screen.getByText('Editing on behalf of Olive Owner')).toBeInTheDocument();
    expect(screen.getByText(/signed in as Ada Admin/)).toBeInTheDocument();
    expect(client.getQueryData(queryKeys.asset('a1', 'en'))).toEqual(asset);
    expect(fetchApi).toHaveBeenCalledWith('/assets/a1', {
      query: { locale: 'en', includeUnpublished: 'true' },
    });
  });

  it('renders the 404 view for a missing asset', async () => {
    fetchApi.mockRejectedValue(new ApiError(problem(404)));
    renderWithProviders(<AdminAssetEditPageClient id="nope" />);
    expect(await screen.findByText('notFound.title')).toBeInTheDocument();
    expect(screen.queryByTestId('wizard')).not.toBeInTheDocument();
  });
});

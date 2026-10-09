import { act, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../helpers/render';
import { queryKeys } from '@/lib/api/queries';

const fetchApi = vi.hoisted(() => vi.fn());
const url = vi.hoisted(() => ({ search: '' }));

vi.mock('@/lib/api/client', () => ({ useAuthedFetch: () => fetchApi }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/admin',
  useSearchParams: () => new URLSearchParams(url.search),
}));
vi.mock('@/lib/hooks/use-intersection', () => ({
  useIntersection: () => ({ ref: () => {}, isIntersecting: false }),
}));

import AdminAuditPage from '@/app/(app)/admin/audit/page';
import AdminReportsPage from '@/app/(app)/admin/reports/page';
import AdminRequestsPage from '@/app/(app)/admin/requests/page';
import AdminStoragePage from '@/app/(app)/admin/storage/page';
import AdminUsersPage from '@/app/(app)/admin/users/page';
import AdminWebhooksPage from '@/app/(app)/admin/webhooks/page';

const page = (items: unknown[]) => ({ items, pageInfo: { hasMore: false, nextCursor: null } });
const pagesOf = (items: unknown[]) => ({ pages: [page(items)], pageParams: [undefined] });

beforeEach(() => {
  fetchApi.mockReset();
  url.search = '';
});

describe('admin list pages (client-fetched via useAuthedFetch)', () => {
  it('audit: key + path + query from the URL filters', async () => {
    url.search = 'action=asset.publish&actorId=u1';
    fetchApi.mockResolvedValue(
      page([
        {
          id: 'e1',
          action: 'asset.publish',
          actorDisplayName: 'Ada',
          subjectType: 'asset',
          subjectId: 'a1',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ]),
    );
    const { client } = renderWithProviders(<AdminAuditPage />);
    expect(await screen.findByText('asset.publish')).toBeInTheDocument();
    const key = queryKeys.adminAudit({
      actorId: 'u1',
      action: 'asset.publish',
      subjectType: '',
      subjectId: '',
      from: '',
      to: '',
    });
    expect(client.getQueryData(key)).toBeDefined();
    expect(fetchApi).toHaveBeenCalledWith('/admin/audit', {
      query: expect.objectContaining({ actorId: 'u1', action: 'asset.publish', limit: 50 }),
    });
  });

  it('reports: key + path + status filter', async () => {
    url.search = 'status=OPEN';
    fetchApi.mockResolvedValue(
      page([
        {
          id: 'r1',
          status: 'OPEN',
          assetTitle: 'Cool Asset',
          category: 'BROKEN',
          reporter: { displayName: 'Rita' },
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ]),
    );
    const { client } = renderWithProviders(<AdminReportsPage />);
    expect(await screen.findByText('Cool Asset')).toBeInTheDocument();
    expect(client.getQueryData(queryKeys.adminReports({ status: 'OPEN' }))).toMatchObject({
      pages: [{ items: [{ id: 'r1' }] }],
    });
    expect(fetchApi).toHaveBeenCalledWith('/admin/reports', {
      query: { status: 'OPEN', cursor: undefined, limit: 50 },
    });
  });

  it('requests: key + path + default (All) filter', async () => {
    fetchApi.mockResolvedValue(
      page([
        {
          id: 'q1',
          status: 'PENDING',
          assetType: 'Plugin',
          assetLink: 'https://example.com/x',
          requester: { displayName: 'Quinn' },
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ]),
    );
    const { client } = renderWithProviders(<AdminRequestsPage />);
    expect(await screen.findByText('Quinn')).toBeInTheDocument();
    expect(client.getQueryData(queryKeys.adminAssetRequests({ status: 'ALL' }))).toMatchObject({
      pages: [{ items: [{ id: 'q1' }] }],
    });
    expect(fetchApi).toHaveBeenCalledWith('/admin/asset-requests', {
      query: { status: undefined, cursor: undefined, limit: 50 },
    });
  });

  it('users: key + path', async () => {
    fetchApi.mockResolvedValue(
      page([
        {
          id: 'u1',
          email: 'una@example.com',
          displayName: 'Una User',
          isAdmin: false,
          createdAt: '2026-01-01T00:00:00.000Z',
          publishedAssetCount: 1,
        },
      ]),
    );
    const { client } = renderWithProviders(<AdminUsersPage />);
    expect(await screen.findByText('una@example.com')).toBeInTheDocument();
    expect(client.getQueryData(queryKeys.adminUsers({ q: '', adminFilter: 'all' }))).toMatchObject(
      pagesOf([{ id: 'u1' }]),
    );
    expect(fetchApi).toHaveBeenCalledWith('/admin/users', {
      query: { q: undefined, isAdmin: undefined, cursor: undefined, limit: 50 },
    });
  });

  it('webhooks: key + path', async () => {
    fetchApi.mockResolvedValue(
      page([
        {
          id: 'w1',
          type: 'asset.published',
          status: 'success',
          createdAt: '2026-01-01T00:00:00.000Z',
          attempts: 1,
        },
      ]),
    );
    const { client } = renderWithProviders(<AdminWebhooksPage />);
    expect(await screen.findByText('asset.published')).toBeInTheDocument();
    expect(client.getQueryData(queryKeys.adminWebhooks({ status: '', type: '' }))).toMatchObject({
      pages: [{ items: [{ id: 'w1' }] }],
    });
    expect(fetchApi).toHaveBeenCalledWith('/admin/webhook-deliveries', {
      query: { status: undefined, type: undefined, cursor: undefined, limit: 50 },
    });
  });

  it('storage: keys + paths for both tabs, dated today', async () => {
    fetchApi.mockResolvedValue([]);
    const { client } = renderWithProviders(<AdminStoragePage />);
    const date = new Date().toISOString().slice(0, 10);
    await vi.waitFor(() => {
      expect(client.getQueryData(queryKeys.adminStorageUsers(date))).toEqual([]);
      expect(client.getQueryData(queryKeys.adminStorageAssets(date))).toEqual([]);
    });
    await act(async () => new Promise((r) => setTimeout(r, 20)));
    expect(fetchApi).toHaveBeenCalledWith('/admin/storage/users', { query: { date, limit: 100 } });
    expect(fetchApi).toHaveBeenCalledWith('/admin/storage/assets', { query: { date, limit: 100 } });
  });
});

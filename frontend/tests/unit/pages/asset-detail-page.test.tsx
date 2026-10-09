import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../../helpers/render';
import { ApiError } from '@/lib/api/errors';
import { queryKeys } from '@/lib/api/queries';
import type { AssetDetail } from '@/lib/api/types';

const fetchApi = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api/client', () => ({ useAuthedFetch: () => fetchApi }));
vi.mock('@/preview/session/me-provider', () => ({
  useMe: () => ({ id: 'me-1', isAdmin: true, displayName: 'Me' }),
}));
vi.mock('@/components/asset/asset-detail-shell', () => ({
  AssetDetailShell: ({
    asset,
    currentUserId,
    isAdmin,
  }: {
    asset: AssetDetail;
    currentUserId: string;
    isAdmin: boolean;
  }) => (
    <div data-testid="shell">
      {asset.title}|{currentUserId}|{String(isAdmin)}
    </div>
  ),
}));

import { AssetDetailPageClient } from '@/components/asset/asset-detail-page-client';

const problem = (status: number) => ({
  type: 'about:blank',
  title: 'x',
  status,
  code: status === 404 ? 'NOT_FOUND' : 'INTERNAL',
});

describe('AssetDetailPageClient', () => {
  beforeEach(() => {
    fetchApi.mockReset();
    document.title = '';
  });

  it('shows the skeleton while pending, then the asset shell with the current user', async () => {
    fetchApi.mockResolvedValue({ id: 'a1', slug: 'cool-asset', title: 'Cool Asset' });
    renderWithProviders(<AssetDetailPageClient idOrSlug="cool-asset" />);
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    expect(await screen.findByTestId('shell')).toHaveTextContent('Cool Asset|me-1|true');
    expect(fetchApi).toHaveBeenCalledWith('/assets/cool-asset', { query: { locale: 'en' } });
    await waitFor(() => expect(document.title).toMatch(/^Cool Asset — /));
  });

  it('url-encodes the id/slug in the request path', async () => {
    fetchApi.mockResolvedValue({ id: 'a1', title: 'T' });
    renderWithProviders(<AssetDetailPageClient idOrSlug="a b/c" />);
    await screen.findByTestId('shell');
    expect(fetchApi.mock.calls[0]![0]).toBe('/assets/a%20b%2Fc');
  });

  it('renders the not-found view on a 404', async () => {
    fetchApi.mockRejectedValue(new ApiError(problem(404)));
    renderWithProviders(<AssetDetailPageClient idOrSlug="missing" />);
    expect(await screen.findByText('notFound.title')).toBeInTheDocument();
    expect(screen.queryByTestId('shell')).not.toBeInTheDocument();
    await waitFor(() => expect(document.title).toMatch(/^notFound.title/));
  });

  it('renders a retryable error view for other failures', async () => {
    fetchApi.mockRejectedValue(new ApiError(problem(500)));
    renderWithProviders(<AssetDetailPageClient idOrSlug="boom" />);
    expect(await screen.findByText('errors.assetLoadTitle')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'errors.tryAgain' })).toBeInTheDocument();
    expect(screen.queryByText('notFound.title')).not.toBeInTheDocument();
  });
  it.each([500, 404])(
    'keeps the loaded asset when a BACKGROUND refetch fails with %s (data + error coexist)',
    async (status) => {
      fetchApi.mockResolvedValue({ id: 'a1', title: 'Cool Asset' });
      const { client } = renderWithProviders(<AssetDetailPageClient idOrSlug="cool-asset" />);
      expect(await screen.findByTestId('shell')).toBeInTheDocument();
      const key = queryKeys.asset('cool-asset', 'en');

      fetchApi.mockRejectedValue(new ApiError(problem(status)));
      await act(async () => {
        await client.invalidateQueries({ queryKey: key });
      });
      await act(async () => new Promise((r) => setTimeout(r, 20)));
      // Precondition: the query is in the error state while still holding the asset.
      expect(client.getQueryState(key)?.status).toBe('error');
      expect(client.getQueryData(key)).toMatchObject({ title: 'Cool Asset' });

      expect(screen.getByTestId('shell')).toHaveTextContent('Cool Asset');
      expect(screen.queryByText('errors.assetLoadTitle')).not.toBeInTheDocument();
      expect(screen.queryByText('notFound.title')).not.toBeInTheDocument();
    },
  );
});

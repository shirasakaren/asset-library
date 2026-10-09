import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../../helpers/render';

const fetchApi = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api/client', () => ({ useAuthedFetch: () => fetchApi }));
vi.mock('@/preview/session/me-provider', () => ({
  useMe: () => ({ id: 'me-1', isAdmin: true, displayName: 'Preview Admin' }),
}));
vi.mock('@/components/discover/featured-carousel', () => ({
  FeaturedCarousel: ({ slots }: { slots: unknown[] }) => <div>featured:{slots.length}</div>,
}));
vi.mock('@/components/discover/quick-filter-pills', () => ({
  QuickFilterPills: ({ categories }: { categories: unknown[] }) => (
    <div>pills:{categories.length}</div>
  ),
}));
vi.mock('@/components/discover/category-row', () => ({
  CategoryRow: ({
    categoryName,
    ownAssetIds,
  }: {
    categoryName: string;
    ownAssetIds: Set<string>;
  }) => (
    <div>
      row:{categoryName}:own={[...ownAssetIds].join(',')}
    </div>
  ),
}));
vi.mock('@/components/discover/discover-all-grid', () => ({
  DiscoverAllGrid: () => <div>all-grid</div>,
}));

import { DiscoverPageClient } from '@/components/discover/discover-page-client';

const discover = {
  featured: [{ id: 'f1' }],
  rows: [
    {
      categoryId: 'c1',
      name: 'Models',
      assets: [
        { id: 'a1', ownerDisplayName: 'Preview Admin' },
        { id: 'a2', ownerDisplayName: 'Someone Else' },
      ],
    },
  ],
};

describe('DiscoverPageClient', () => {
  beforeEach(() => {
    fetchApi.mockReset();
  });

  it('shows a skeleton while pending, then featured, pills, rows and the grid', async () => {
    fetchApi.mockImplementation(async (path: string) =>
      path === '/discover' ? discover : [{ id: 'c1' }, { id: 'c2' }],
    );
    renderWithProviders(<DiscoverPageClient />);
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    expect(await screen.findByText('featured:1')).toBeInTheDocument();
    expect(screen.getByText('pills:2')).toBeInTheDocument();
    expect(screen.getByText('row:Models:own=a1')).toBeInTheDocument();
    expect(screen.getByText('all-grid')).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Loading' })).not.toBeInTheDocument();
  });

  it('still shows the All assets grid when the feed fails to load', async () => {
    fetchApi.mockRejectedValue(new Error('boom'));
    renderWithProviders(<DiscoverPageClient />);
    await waitFor(() =>
      expect(screen.queryByRole('status', { name: 'Loading' })).not.toBeInTheDocument(),
    );
    expect(screen.getByText('all-grid')).toBeInTheDocument();
    expect(screen.queryByText(/^featured:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^row:/)).not.toBeInTheDocument();
  });
});

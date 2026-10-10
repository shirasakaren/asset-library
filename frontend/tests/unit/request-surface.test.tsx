import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../helpers/render';
import type { AssetRequest, MeResponse } from '@/lib/api/types';

vi.mock('@/lib/api/client', () => ({ useAuthedFetch: () => vi.fn() }));
vi.mock('@/components/request/request-form', () => ({ RequestForm: () => null }));

import { RequestSurface } from '@/components/request/request-surface';

const me = { id: 'me-1' } as MeResponse;
const req = (price: number | null): AssetRequest => ({
  id: 'r1',
  assetLink: 'https://store.example/asset',
  assetType: 'Environment',
  intendedUse: 'Prototype',
  price,
  notes: null,
  status: 'SENT',
  adminComment: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  requester: { id: 'me-1', displayName: 'Aria' },
});

describe('RequestSurface price', () => {
  it('renders the price with two decimals ($12.50, not $12.5)', () => {
    renderWithProviders(<RequestSurface me={me} initial={[req(12.5)]} />);
    expect(screen.getByText('$12.50')).toBeInTheDocument();
    expect(screen.queryByText('$12.5')).not.toBeInTheDocument();
  });

  it('omits the price row when there is none', () => {
    renderWithProviders(<RequestSurface me={me} initial={[req(null)]} />);
    expect(screen.queryByText(/^\$/)).not.toBeInTheDocument();
  });
});

import { screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { renderWithProviders as render } from '../helpers/render';
import { AssetCard } from '@/components/asset/asset-card';
import type { AssetSummary } from '@/lib/api/types';

const asset: AssetSummary = {
  id: 'a1',
  slug: 'demo-asset',
  title: 'Demo asset',
  shortDescription: 'A short description for testing the card.',
  engine: 'UNITY',
  status: 'PUBLISHED',
  thumbnailUrl: null,
  ownerDisplayName: 'Mira Lestari',
  categoryName: 'Tools',
  totalDownloads: 1234,
  totalSaves: 56,
  updatedAt: '2026-01-01T00:00:00Z',
  publishedAt: '2026-01-01T00:00:00Z',
};

// react-query provider isn't needed for SaveButton rendering — the mutation
// hook is only invoked on click. We just verify the surface here.

describe('AssetCard (grid)', () => {
  it('renders title, owner, and category', () => {
    render(<AssetCard variant="grid" asset={asset} />);
    expect(screen.getByText('Demo asset')).toBeInTheDocument();
    expect(screen.getByText(/Mira Lestari/)).toBeInTheDocument();
    expect(screen.getByText('Tools')).toBeInTheDocument();
  });

  it('hides the save button for owners and shows the "Your asset" tag', () => {
    render(<AssetCard variant="grid" asset={asset} isOwner />);
    expect(screen.getByText('Your asset')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save/i })).toBeNull();
  });

  it('renders the save button when not owner', () => {
    render(<AssetCard variant="grid" asset={asset} />);
    expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
  });
});

describe('AssetCard (compact)', () => {
  it('renders title and download count', () => {
    render(<AssetCard variant="compact" asset={asset} />);
    expect(screen.getByText('Demo asset')).toBeInTheDocument();
    // 1234 formatted as "1.2k"
    expect(screen.getByText(/1\.2k/)).toBeInTheDocument();
  });
});

describe('AssetCard (feature)', () => {
  it('renders title and category in feature variant', () => {
    render(<AssetCard variant="feature" asset={asset} bannerUrl={null} />);
    expect(screen.getByText('Demo asset')).toBeInTheDocument();
    expect(screen.getByText('Tools')).toBeInTheDocument();
  });
});

describe('AssetCard (row)', () => {
  it('renders title and short description', () => {
    render(<AssetCard variant="row" asset={asset} />);
    expect(screen.getByText('Demo asset')).toBeInTheDocument();
    expect(screen.getByText(/A short description/)).toBeInTheDocument();
  });
});

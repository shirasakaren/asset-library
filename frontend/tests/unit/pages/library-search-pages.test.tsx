import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderRaw } from '../../helpers/render';

const suspend = vi.hoisted(() => ({ on: false }));
const pending = vi.hoisted(() => new Promise<never>(() => {}));

vi.mock('@/components/library/library-filters', () => ({
  LibraryFilters: () => {
    if (suspend.on) throw pending;
    return <div>library-filters</div>;
  },
}));
vi.mock('@/components/library/library-grid', () => ({
  LibraryGrid: () => <div>library-grid</div>,
}));
vi.mock('@/components/filters/search-filter-sidebar', () => ({
  SearchFilterSidebar: () => {
    if (suspend.on) throw pending;
    return <div>search-sidebar</div>;
  },
}));
vi.mock('@/components/search/search-results', () => ({
  SearchResults: () => <div>search-results</div>,
}));

import { LibraryPageClient } from '@/components/library/library-page-client';
import { SearchPageClient } from '@/components/search/search-page-client';

afterEach(() => {
  suspend.on = false;
});

describe('LibraryPageClient', () => {
  it('renders filters and grid', () => {
    renderRaw(<LibraryPageClient />);
    expect(screen.getByText('library-filters')).toBeInTheDocument();
    expect(screen.getByText('library-grid')).toBeInTheDocument();
  });

  it('wraps the useSearchParams consumers in Suspense with a skeleton fallback', () => {
    suspend.on = true;
    renderRaw(<LibraryPageClient />);
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    expect(screen.queryByText('library-grid')).not.toBeInTheDocument();
  });
});

describe('SearchPageClient', () => {
  it('renders sidebar and results', () => {
    renderRaw(<SearchPageClient />);
    expect(screen.getByText('search-sidebar')).toBeInTheDocument();
    expect(screen.getByText('search-results')).toBeInTheDocument();
  });

  it('wraps the useSearchParams consumers in Suspense with a skeleton fallback', () => {
    suspend.on = true;
    renderRaw(<SearchPageClient />);
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    expect(screen.queryByText('search-results')).not.toBeInTheDocument();
  });
});

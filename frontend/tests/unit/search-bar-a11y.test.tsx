import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders as render } from '../helpers/render';
import { SearchBar } from '@/components/navigation/search-bar';

vi.mock('next/image', () => ({ default: () => null }));

describe('SearchBar accessibility', () => {
  it('is a combobox: aria-expanded is only valid on that role, a plain searchbox may not carry it', () => {
    render(<SearchBar />);
    const input = screen.getByRole('combobox', { name: 'common.search' });
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(input).toHaveAttribute('aria-controls', 'search-typeahead');
    expect(input).toHaveAttribute('aria-autocomplete', 'list');
  });
});

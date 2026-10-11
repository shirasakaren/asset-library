import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { renderWithProviders } from '../helpers/render';

const fetchApi = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api/client', () => ({ useAuthedFetch: () => fetchApi }));
vi.mock('@/lib/hooks/use-intersection', () => ({
  useIntersection: () => ({ ref: () => {}, isIntersecting: false }),
}));
vi.mock('next-intl', async (orig) => ({
  ...(await orig<typeof import('next-intl')>()),
  useLocale: () => 'en',
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock('@/components/ui/toaster', () => ({ toast }));

import { AdminTagsSurface } from '@/components/admin/tags-surface';

const tag = (id: string, slug: string, usageCount = 1) => ({
  id,
  slug,
  displayName: slug,
  usageCount,
  createdAt: '2026-01-01T00:00:00.000Z',
});

describe('merge tags modal', () => {
  beforeEach(() => {
    fetchApi.mockReset();
    toast.success.mockClear();
  });

  it('invalidates the tag suggestions after a merge, so the deleted tag is not offered again', async () => {
    let tags = [tag('t1', 'lava'), tag('t2', 'lavaa')];
    fetchApi.mockImplementation(async (path: string, init?: { method?: string }) => {
      if (path === '/admin/tags/merge') {
        tags = [tag('t2', 'lavaa', 2)];
        return undefined;
      }
      if (path === '/admin/tags') return { items: tags, pageInfo: { hasMore: false } };
      if (path === '/tags') return tags;
      throw new Error(`unexpected ${init?.method ?? 'GET'} ${path}`);
    });
    // gcTime: Infinity, so the suggestions of the closed modal can still be inspected.
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    });
    renderWithProviders(<AdminTagsSurface />, { client });
    fireEvent.click(await screen.findByRole('button', { name: 'Merge tags' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByPlaceholderText('Type a tag…'), {
      target: { value: 'lav' },
    });
    await within(dialog).findAllByText('lava', {}, { timeout: 2000 });
    const rows = within(dialog).getAllByRole('listitem');
    fireEvent.click(within(rows[0]!).getByRole('button', { name: 'From' }));
    fireEvent.click(within(rows[1]!).getByRole('button', { name: 'Into' }));
    const suggestKey = ['admin', 'tag-suggest', 'lav'];
    expect(client.getQueryState(suggestKey)?.isInvalidated).toBe(false);

    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Merge' }));
    });
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(client.getQueryState(suggestKey)?.isInvalidated).toBe(true);
  });
});

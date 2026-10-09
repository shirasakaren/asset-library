import { act, fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../helpers/render';
import { ApiError } from '@/lib/api/errors';
import { queryKeys } from '@/lib/api/queries';

const fetchApi = vi.hoisted(() => vi.fn());
const meState = vi.hoisted(() => ({ id: 'me-1', isAdmin: false }));

vi.mock('@/lib/api/client', () => ({ useAuthedFetch: () => fetchApi }));
vi.mock('@/preview/session/me-provider', () => ({
  useMe: () => ({ id: meState.id, isAdmin: meState.isAdmin }),
}));

import { OwnedAssetGate } from '@/components/publish/owned-asset-gate';

const problem = (status: number) => ({
  type: 'about:blank',
  title: 'x',
  status,
  code: status === 404 ? 'NOT_FOUND' : 'INTERNAL',
});
const asset = (ownerId = 'me-1') => ({ id: 'a1', title: 'Asset One', owner: { id: ownerId } });
const key = queryKeys.asset('a1', 'en');

/** Lets React Query's batched notifications reach the component before asserting. */
const flush = () => act(async () => new Promise((r) => setTimeout(r, 20)));

function renderGate(id = 'a1') {
  return renderWithProviders(
    <OwnedAssetGate id={id}>{(a) => <div data-testid="child">{a.title}</div>}</OwnedAssetGate>,
  );
}

beforeEach(() => {
  fetchApi.mockReset();
  meState.id = 'me-1';
  meState.isAdmin = false;
});

describe('OwnedAssetGate', () => {
  it('loads under queryKeys.asset(id, locale) with includeUnpublished', async () => {
    fetchApi.mockResolvedValue(asset());
    const { client } = renderGate();
    expect(await screen.findByTestId('child')).toHaveTextContent('Asset One');
    expect(client.getQueryData(key)).toEqual(asset());
    expect(fetchApi).toHaveBeenCalledWith('/assets/a1', {
      query: { locale: 'en', includeUnpublished: 'true' },
    });
  });

  it('keeps the live children when a BACKGROUND refetch fails (data + error coexist)', async () => {
    fetchApi.mockResolvedValue(asset());
    const { client } = renderGate();
    expect(await screen.findByTestId('child')).toBeInTheDocument();

    fetchApi.mockRejectedValue(new ApiError(problem(500)));
    await act(async () => {
      await client.invalidateQueries({ queryKey: key });
    });
    await flush();
    // Precondition: the query really is in the error state while still holding data.
    expect(client.getQueryState(key)?.status).toBe('error');
    expect(client.getQueryData(key)).toEqual(asset());

    expect(screen.getByTestId('child')).toBeInTheDocument();
    expect(screen.queryByText('errors.boundaryTitle')).not.toBeInTheDocument();
    expect(screen.queryByText('notFound.title')).not.toBeInTheDocument();
  });

  it('keeps the children when a background refetch fails with a 404', async () => {
    fetchApi.mockResolvedValue(asset());
    const { client } = renderGate();
    await screen.findByTestId('child');
    fetchApi.mockRejectedValue(new ApiError(problem(404)));
    await act(async () => {
      await client.invalidateQueries({ queryKey: key });
    });
    await flush();
    expect(client.getQueryState(key)?.status).toBe('error');
    expect(screen.getByTestId('child')).toBeInTheDocument();
    expect(screen.queryByText('notFound.title')).not.toBeInTheDocument();
  });

  it('decides ownership from cached data: a failed refetch does not flip the guard', async () => {
    fetchApi.mockResolvedValue(asset('other'));
    const { client } = renderGate();
    expect(await screen.findByText('notFound.title')).toBeInTheDocument();
    fetchApi.mockRejectedValue(new ApiError(problem(500)));
    await act(async () => {
      await client.invalidateQueries({ queryKey: key });
    });
    await flush();
    expect(screen.getByText('notFound.title')).toBeInTheDocument();
    expect(screen.queryByTestId('child')).not.toBeInTheDocument();
    expect(screen.queryByText('errors.boundaryTitle')).not.toBeInTheDocument();
  });

  it('shows the 404 view when the initial load is a 404', async () => {
    fetchApi.mockRejectedValue(new ApiError(problem(404)));
    renderGate('missing');
    expect(await screen.findByText('notFound.title')).toBeInTheDocument();
    expect(screen.queryByTestId('child')).not.toBeInTheDocument();
  });

  it('shows a retryable error on an initial 500, and retry recovers', async () => {
    fetchApi.mockRejectedValueOnce(new ApiError(problem(500)));
    renderGate();
    expect(await screen.findByText('errors.boundaryTitle')).toBeInTheDocument();
    fetchApi.mockResolvedValue(asset());
    fireEvent.click(screen.getByRole('button', { name: 'errors.tryAgain' }));
    expect(await screen.findByTestId('child')).toBeInTheDocument();
    expect(screen.queryByText('errors.boundaryTitle')).not.toBeInTheDocument();
  });
});

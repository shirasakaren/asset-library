import { describe, it, expect, beforeEach, vi } from 'vitest';
import { apiFetch } from '@/lib/api/fetcher';
import { ApiError } from '@/lib/api/errors';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('apiFetch — 401 retry-once', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('without a tokenRefresher, surfaces a 401 immediately (no retry)', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse(401, { code: 'auth.unauthenticated' }));
    await expect(apiFetch('/me', { accessToken: 'stale' })).rejects.toBeInstanceOf(ApiError);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('with a tokenRefresher, retries once on 401 using the refreshed token and succeeds', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse(401, { code: 'auth.unauthenticated' }))
      .mockResolvedValueOnce(jsonResponse(200, { id: 'u1' }));
    const refresher = vi.fn().mockResolvedValue('fresh-token');

    const res = await apiFetch<{ id: string }>('/me', {
      accessToken: 'stale-token',
      tokenRefresher: refresher,
    });

    expect(res).toEqual({ id: 'u1' });
    expect(refresher).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const secondCall = fetchSpy.mock.calls[1];
    const init = secondCall[1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer fresh-token');
  });

  it('does not loop: a second 401 after the retry surfaces the error', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse(401, { code: 'auth.unauthenticated' }))
      .mockResolvedValueOnce(jsonResponse(401, { code: 'auth.unauthenticated' }));
    const refresher = vi.fn().mockResolvedValue('still-bad');

    await expect(
      apiFetch('/me', { accessToken: 'stale', tokenRefresher: refresher }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(refresher).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('skips retry when the refresher returns no token', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse(401, { code: 'auth.unauthenticated' }));
    const refresher = vi.fn().mockResolvedValue(undefined);
    await expect(
      apiFetch('/me', { accessToken: 'stale', tokenRefresher: refresher }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

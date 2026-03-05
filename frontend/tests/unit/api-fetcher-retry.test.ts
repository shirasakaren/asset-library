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

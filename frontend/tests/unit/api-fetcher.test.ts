import { describe, it, expect, vi, beforeEach } from 'vitest';

const previewFetch = vi.fn();
vi.mock('@/preview', () => ({ previewFetch: (...a: unknown[]) => previewFetch(...a) }));

import { apiFetch } from '@/lib/api/fetcher';

describe('apiFetch', () => {
  beforeEach(() => {
    previewFetch.mockReset();
  });

  it('delegates to previewFetch with method/query/body/locale only', async () => {
    previewFetch.mockResolvedValue({ ok: true });
    const out = await apiFetch('/assets', {
      method: 'POST',
      query: { a: [1, 2] },
      body: { x: 1 },
      locale: 'id',
      accessToken: 'tok',
      idempotencyKey: 'k',
      tokenRefresher: async () => 'new',
    });
    expect(out).toEqual({ ok: true });
    expect(previewFetch).toHaveBeenCalledWith('/assets', {
      method: 'POST',
      query: { a: [1, 2] },
      body: { x: 1 },
      locale: 'id',
    });
  });

  it('works with no init and propagates rejections', async () => {
    previewFetch.mockImplementation(async () => {
      throw new Error('boom');
    });
    const err = await apiFetch('/x').then(
      () => null,
      (e: unknown) => e,
    );
    expect((err as Error).message).toBe('boom');
    expect(previewFetch.mock.calls[0]).toEqual([
      '/x',
      { method: undefined, query: undefined, body: undefined, locale: undefined },
    ]);
  });
});

import { describe, it, expect } from 'vitest';
import { ApiError } from '@/lib/api/errors';

describe('ApiError', () => {
  it('exposes status, code, instance, fields', () => {
    const err = new ApiError(
      {
        type: 'about:blank',
        title: 'NotFound',
        status: 404,
        code: 'asset.not_found',
        instance: '/assets/missing',
        fields: [{ path: 'id', code: 'missing', message: 'required' }],
      },
      'rid-123',
    );
    expect(err.status).toBe(404);
    expect(err.code).toBe('asset.not_found');
    expect(err.instance).toBe('/assets/missing');
    expect(err.fields).toHaveLength(1);
    expect(err.requestId).toBe('rid-123');
    expect(ApiError.isApiError(err)).toBe(true);
  });
});

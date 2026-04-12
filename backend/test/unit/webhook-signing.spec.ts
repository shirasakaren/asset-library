import { createHmac } from 'node:crypto';

/**
 * Quick test of the HMAC-SHA256 contract that webhook receivers (n8n) verify.
 * We don't exercise the worker itself here — the network fetch is mocked
 * inside the integration suite. But the signature math is part of the public
 * contract, so it gets its own focused test.
 */
describe('webhook HMAC signing', () => {
  const SECRET = 'mgm-test-secret-1234567890';

  function sign(body: string): string {
    return `sha256=${createHmac('sha256', SECRET).update(body).digest('hex')}`;
  }

  it('produces a stable signature for the same body', () => {
    const body = JSON.stringify({ id: 'wh_abc', type: 'comment.created' });
    expect(sign(body)).toBe(sign(body));
  });

  it('differs when the body differs', () => {
    expect(sign('{"a":1}')).not.toBe(sign('{"a":2}'));
  });

  it('uses the lowercase hex digest', () => {
    expect(sign('{}')).toMatch(/^sha256=[0-9a-f]{64}$/);
  });
});

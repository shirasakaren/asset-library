import { CachedService } from '../../src/infra/redis/cached.service';
import { RedisService } from '../../src/infra/redis/redis.service';

/**
 * Minimal in-memory stand-in for the `ioredis` client surface that
 * `CachedService` actually touches (get/set/del). Tracks call counts so we
 * can assert read-through behaviour.
 */
class FakeRedisClient {
  store = new Map<string, string>();
  ttls = new Map<string, number>();
  getCalls = 0;
  setCalls = 0;
  delCalls = 0;

  async get(key: string): Promise<string | null> {
    this.getCalls += 1;
    return this.store.get(key) ?? null;
  }

  async set(key: string, value: string, _mode: string, ttl: number): Promise<'OK'> {
    this.setCalls += 1;
    this.store.set(key, value);
    this.ttls.set(key, ttl);
    return 'OK';
  }

  async del(...keys: string[]): Promise<number> {
    this.delCalls += 1;
    let removed = 0;
    for (const k of keys) {
      if (this.store.delete(k)) removed += 1;
      this.ttls.delete(k);
    }
    return removed;
  }

  // Force getOrFetch's SET path to reject — used to confirm best-effort writes
  // don't surface failures to the caller.
  failNextSet = false;
  async setFailing(key: string, value: string, _mode: string, ttl: number): Promise<'OK'> {
    if (this.failNextSet) {
      this.failNextSet = false;
      throw new Error('redis-down');
    }
    return this.set(key, value, _mode, ttl);
  }
}

function build(): { svc: CachedService; client: FakeRedisClient } {
  const client = new FakeRedisClient();
  const svc = new CachedService({ client } as unknown as RedisService);
  return { svc, client };
}

describe('CachedService', () => {
  it('first call invokes the fetcher and writes to cache; second call within TTL skips the fetcher', async () => {
    const { svc, client } = build();
    const fetcher = jest.fn().mockResolvedValue({ hello: 'world' });

    const first = await svc.getOrFetch('k', 60, fetcher);
    expect(first).toEqual({ hello: 'world' });
    expect(fetcher).toHaveBeenCalledTimes(1);

    // Allow the fire-and-forget SET .catch() to settle on the microtask queue.
    await new Promise((r) => setImmediate(r));
    expect(client.store.get('k')).toBe(JSON.stringify({ hello: 'world' }));
    expect(client.ttls.get('k')).toBe(60);

    const second = await svc.getOrFetch('k', 60, fetcher);
    expect(second).toEqual({ hello: 'world' });
    // Fetcher must not run again — that's the whole point of the cache.
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(client.getCalls).toBe(2);
  });

  it('different keys do not share cache entries', async () => {
    const { svc } = build();
    const a = jest.fn().mockResolvedValue('A');
    const b = jest.fn().mockResolvedValue('B');

    expect(await svc.getOrFetch('k-en', 60, a)).toBe('A');
    expect(await svc.getOrFetch('k-id', 60, b)).toBe('B');
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);

    // Hitting the same keys again — both fetchers stay at one call.
    await svc.getOrFetch('k-en', 60, a);

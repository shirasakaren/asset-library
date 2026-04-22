import { CachedService } from '../../src/infra/redis/cached.service';
import { CategoriesService } from '../../src/modules/categories/categories.service';
import { PrismaService } from '../../src/infra/prisma/prisma.service';
import { RedisService } from '../../src/infra/redis/redis.service';

/**
 * In-process integration test for the read-through cache wrapping
 * `GET /categories`. Uses the real `CachedService` (no mocks of the helper),
 * a real in-memory Redis stand-in, and a stub `PrismaService` whose calls
 * we count. Verifies the three behaviours called out in the perf P0 spec:
 *   1. First call hits Prisma exactly once.
 *   2. Second call within TTL skips Prisma entirely.
 *   3. After invalidation (or under a different cache key / locale), Prisma
 *      runs again.
 */

class FakeRedisClient {
  store = new Map<string, string>();
  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }
  async set(key: string, value: string): Promise<'OK'> {
    this.store.set(key, value);
    return 'OK';
  }
  async del(...keys: string[]): Promise<number> {
    let removed = 0;
    for (const k of keys) if (this.store.delete(k)) removed += 1;
    return removed;
  }
}

function buildPrismaStub() {
  const calls = { findMany: 0, groupBy: 0 };
  const prisma = {
    category: {
      findMany: jest.fn(async () => {
        calls.findMany += 1;
        return [
          {
            id: 'cat_1',
            slug: 'props',
            name: { en: 'Props', id: 'Properti' },
            iconKey: null,
            sortOrder: 0,
            isActive: true,
          },
        ];
      }),
    },
    asset: {
      groupBy: jest.fn(async () => {
        calls.groupBy += 1;
        return [{ categoryId: 'cat_1', _count: { _all: 7 } }];
      }),
    },
  };
  return { prisma: prisma as unknown as PrismaService, calls };
}

describe('CategoriesService — Redis cache', () => {
  function build() {
    const client = new FakeRedisClient();
    const cached = new CachedService({ client } as unknown as RedisService);
    const { prisma, calls } = buildPrismaStub();
    const svc = new CategoriesService(prisma, cached);
    return { svc, calls, client };
  }

  it('first call queries Prisma; second call within TTL does not', async () => {
    const { svc, calls } = build();

    const first = await svc.list('en');
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ id: 'cat_1', slug: 'props', name: 'Props', assetCount: 7 });
    expect(calls.findMany).toBe(1);
    expect(calls.groupBy).toBe(1);

    // Let the fire-and-forget SET resolve.
    await new Promise((r) => setImmediate(r));

    const second = await svc.list('en');
    expect(second).toEqual(first);
    // Prisma must not be touched again — verified via spy counts.
    expect(calls.findMany).toBe(1);
    expect(calls.groupBy).toBe(1);
  });

  it('different locale uses a different cache key and re-runs the query', async () => {
    const { svc, calls } = build();

    await svc.list('en');
    await new Promise((r) => setImmediate(r));
    expect(calls.findMany).toBe(1);

    // Different locale → different cache key → fresh DB call.
    await svc.list('id');
    expect(calls.findMany).toBe(2);
    expect(calls.groupBy).toBe(2);

    // ...but the second `id` call hits the cache.
    await new Promise((r) => setImmediate(r));
    await svc.list('id');
    expect(calls.findMany).toBe(2);
  });

  it('invalidateCache() forces a fresh Prisma query on the next list()', async () => {
    const { svc, calls } = build();

    await svc.list('en');
    await new Promise((r) => setImmediate(r));
    expect(calls.findMany).toBe(1);

    await svc.invalidateCache();
    await svc.list('en');
    expect(calls.findMany).toBe(2);
  });
});

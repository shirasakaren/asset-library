import { IdempotencyService } from '../../src/common/idempotency/idempotency.service';
import { ConflictDomainException } from '../../src/common/errors/problem.dto';
import { RedisService } from '../../src/infra/redis/redis.service';

class FakeRedisClient {
  private store = new Map<string, string>();
  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }
  async set(key: string, value: string): Promise<'OK'> {
    this.store.set(key, value);
    return 'OK';
  }
}

describe('IdempotencyService', () => {
  function build() {
    const client = new FakeRedisClient();
    const svc = new IdempotencyService({ client } as unknown as RedisService);
    return { svc, client };
  }

  it('returns null on a fresh key', async () => {
    const { svc } = build();
    expect(await svc.lookup('user-1', 'POST /assets', 'k1', { a: 1 })).toBeNull();
  });

  it('replays the stored response when the body is identical', async () => {
    const { svc } = build();
    await svc.store('user-1', 'POST /assets', 'k1', { a: 1 }, 201, { id: 'cln_asset' });
    const hit = await svc.lookup('user-1', 'POST /assets', 'k1', { a: 1 });
    expect(hit?.response).toEqual({ id: 'cln_asset' });
  });

  it('raises a conflict when the body differs', async () => {
    const { svc } = build();
    await svc.store('user-1', 'POST /assets', 'k1', { a: 1 }, 201, { id: 'cln_asset' });
    await expect(svc.lookup('user-1', 'POST /assets', 'k1', { a: 2 })).rejects.toBeInstanceOf(
      ConflictDomainException,
    );
  });

  it('keys cache per user — separate users get separate slots', async () => {
    const { svc } = build();
    await svc.store('user-1', 'POST /assets', 'k1', { a: 1 }, 201, 'a');
    expect(await svc.lookup('user-2', 'POST /assets', 'k1', { a: 1 })).toBeNull();
  });
});

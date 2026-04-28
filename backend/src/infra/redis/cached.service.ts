import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from './redis.service';

/**
 * Small Redis-backed read-through cache helper.
 *
 * Follows the same shape as the existing inline pattern in
 * `DiscoverService` (GET → JSON.parse on hit; otherwise compute, JSON.stringify,
 * SET EX). Centralised here so the three read-mostly catalog endpoints
 * (`/categories`, `/licenses`, popular-tag listings) share one implementation
 * — and so future cache write/read failures can be logged in one place rather
 * than swallowed silently per call site.
 *
 * Behaviour:
 *   - Cache READ failures fall through to the fetcher (treated as a miss, logged).
 *   - Cache WRITE failures do not block the response (best-effort, logged).
 *   - No singleflight: a thundering herd will run the fetcher multiple times.
 *     Acceptable here because these endpoints are cheap and a stampede is
 *     no worse than today's per-request behaviour. (P2: singleflight.)
 */
@Injectable()
export class CachedService {
  private readonly logger = new Logger(CachedService.name);

  constructor(private readonly redis: RedisService) {}

  async getOrFetch<T>(key: string, ttlSeconds: number, fetcher: () => Promise<T>): Promise<T> {
    let hit: string | null = null;
    try {
      hit = await this.redis.client.get(key);
    } catch (err) {
      this.logger.warn(`Cache GET failed for ${key}: ${(err as Error).message}`);
    }
    if (hit) {
      try {
        return JSON.parse(hit) as T;
      } catch (err) {
        // Corrupt cache entry — drop it and fall through to the fetcher.
        this.logger.warn(`Cache parse failed for ${key}: ${(err as Error).message}`);
      }
    }
    const value = await fetcher();
    // Best-effort: do not await the SET on the response path. Failures here
    // (Redis blip, OOM eviction policy refusing the write, etc.) must not
    // turn into a 500 for the user.
    void this.redis.client.set(key, JSON.stringify(value), 'EX', ttlSeconds).catch((err) => {
      this.logger.warn(`Cache SET failed for ${key}: ${(err as Error).message}`);
    });
    return value;
  }

  /** Drop one or more cache keys; failures are logged but never thrown. */
  async invalidate(...keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    try {
      await this.redis.client.del(...keys);
    } catch (err) {
      this.logger.warn(`Cache DEL failed for ${keys.join(',')}: ${(err as Error).message}`);
    }
  }
}

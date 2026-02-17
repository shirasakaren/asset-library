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

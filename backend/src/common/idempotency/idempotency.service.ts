import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { RedisService } from '../../infra/redis/redis.service';
import { ConflictDomainException } from '../errors/problem.dto';
import { ErrorCode } from '../errors/error-code';

/** TTL for replayable responses — long enough to ride out client retries. */
const TTL_SECONDS = 24 * 60 * 60;

export interface IdempotencyRecord {
  bodyHash: string;
  status: number;
  response: unknown;
}

/**
 * Redis-backed idempotency for mutating endpoints. Clients pass an
 * `Idempotency-Key` header; the first request runs normally and we cache its
 * response. Retries within 24 h get the same response replayed. A retry that
 * sends a *different* body for the same key is rejected as a conflict — that
 * almost always means the client lost track of which operation it was retrying.
 */
@Injectable()
export class IdempotencyService {
  constructor(private readonly redis: RedisService) {}

  private key(userId: string, route: string, key: string): string {
    return `idem:${userId}:${route}:${key}`;
  }

  private hashBody(body: unknown): string {
    return createHash('sha256')
      .update(JSON.stringify(body ?? null))
      .digest('hex');
  }

  /** Returns a cached response if this `(user, route, key)` already ran. */
  async lookup(
    userId: string,
    route: string,
    key: string,
    body: unknown,
  ): Promise<IdempotencyRecord | null> {
    const raw = await this.redis.client.get(this.key(userId, route, key));
    if (!raw) return null;
    const record = JSON.parse(raw) as IdempotencyRecord;
    if (record.bodyHash !== this.hashBody(body)) {
      throw new ConflictDomainException(
        ErrorCode.IDEMPOTENCY_KEY_REUSED,
        'Idempotency-Key has been used with a different request body.',
      );
    }
    return record;
  }

  async store(
    userId: string,
    route: string,
    key: string,
    body: unknown,
    status: number,
    response: unknown,
  ): Promise<void> {
    const record: IdempotencyRecord = {
      bodyHash: this.hashBody(body),
      status,
      response,
    };
    await this.redis.client.set(
      this.key(userId, route, key),
      JSON.stringify(record),
      'EX',
      TTL_SECONDS,
    );
  }
}

import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FastifyRequest } from 'fastify';
import { RedisService } from '../../infra/redis/redis.service';
import { DomainException } from '../errors/problem.dto';
import { ErrorCode } from '../errors/error-code';
import { AuthenticatedRequestUser } from '../../infra/keycloak/keycloak-auth.guard';
import { RATE_LIMIT_KEY, RateLimitConfig } from './rate-limit.decorator';

/**
 * Fixed-window Redis counter. Cheap and predictable — at most one INCR + one
 * EXPIRE per request. Window boundaries align to wall-clock seconds so the
 * burst at the boundary is bounded.
 *
 * On limit exceeded we emit a 429 problem+json with a `Retry-After` header.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly redis: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const config = this.reflector.getAllAndOverride<RateLimitConfig | undefined>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!config) return true;

    const req = context
      .switchToHttp()
      .getRequest<FastifyRequest & { user?: AuthenticatedRequestUser }>();
    const principal = req.user?.user;
    const identifier = this.identifierFor(config, req, principal?.id);
    if (!identifier) return true;

    const name = config.name ?? `${context.getClass().name}.${context.getHandler().name}`;
    const windowStart = Math.floor(Date.now() / 1000 / config.windowSec) * config.windowSec;
    const key = `rl:${name}:${identifier}:${windowStart}`;

    const used = await this.redis.client.incr(key);
    if (used === 1) {
      await this.redis.client.expire(key, config.windowSec);
    }
    if (used > config.max) {
      const retryAfter = config.windowSec - (Math.floor(Date.now() / 1000) - windowStart);
      const res = context.switchToHttp().getResponse<{ header: (k: string, v: string) => void }>();
      try {
        res.header('Retry-After', String(Math.max(retryAfter, 1)));
      } catch {
        // Fastify reply already shipped; safe to ignore.
      }
      throw new DomainException(
        HttpStatus.TOO_MANY_REQUESTS,
        ErrorCode.RATE_LIMIT_EXCEEDED,
        `Rate limit exceeded — at most ${config.max} per ${config.windowSec}s on ${name}.`,
      );
    }
    return true;
  }

  private identifierFor(
    config: RateLimitConfig,
    req: FastifyRequest,
    userId: string | undefined,
  ): string | null {
    switch (config.scope) {
      case 'user':
        return userId ?? null;
      case 'ip':
        return req.ip;
      case 'global':
        return 'all';
    }
  }
}

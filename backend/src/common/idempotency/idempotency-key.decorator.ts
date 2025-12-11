import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { FastifyRequest } from 'fastify';

/**
 * Parameter decorator that surfaces the `Idempotency-Key` header (RFC draft).
 * Returns `null` when the header is missing so handlers can decide whether to
 * require it.
 */
export const IdempotencyKey = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): string | null => {
    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    const raw = req.headers['idempotency-key'];
    if (!raw) return null;
    const value = Array.isArray(raw) ? raw[0] : raw;
    return typeof value === 'string' && value.length > 0 ? value : null;
  },
);

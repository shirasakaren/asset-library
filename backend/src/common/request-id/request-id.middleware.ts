import { Injectable, NestMiddleware } from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';

/**
 * Ensures every request carries a stable `X-Request-Id`. Honour an inbound
 * header from an upstream proxy if present, otherwise mint one. Surfaced
 * on the response, in problem+json `instance` errors, and in Pino log lines
 * (via `genReqId` wiring in `main.ts`).
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(
    req: FastifyRequest['raw'] & { id?: string },
    res: FastifyReply['raw'],
    next: () => void,
  ): void {
    const inbound =
      (req.headers['x-request-id'] as string | undefined) ??
      (req.headers['x-amzn-trace-id'] as string | undefined);
    const id = inbound && inbound.length <= 200 ? inbound : randomUUID();
    req.id = id;
    res.setHeader('x-request-id', id);
    next();
  }
}

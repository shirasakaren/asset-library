import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FastifyRequest } from 'fastify';
import { BadRequestDomainException } from '../errors/problem.dto';
import { ErrorCode } from '../errors/error-code';
import {
  CONFIRMATION_KEY,
  CONFIRMATION_PHRASE,
  CONFIRMATION_WINDOW_SEC,
} from './require-confirmation.decorator';

interface ConfirmationBody {
  confirm?: string;
  confirmedAt?: string;
}

/**
 * Enforces the destructive-admin-action confirmation contract. Reads
 * `request.body.confirm` + `confirmedAt` and rejects with 400 (re-using the
 * domain exception channel so the frontend renders our standard problem+json).
 */
@Injectable()
export class ConfirmationGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<boolean>(CONFIRMATION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;
    const req = context.switchToHttp().getRequest<FastifyRequest & { body?: ConfirmationBody }>();
    const body = (req.body ?? {}) as ConfirmationBody;
    if (body.confirm !== CONFIRMATION_PHRASE) {
      throw new BadRequestDomainException(
        ErrorCode.CONFIRMATION_REQUIRED,
        `Confirmation phrase missing — set body.confirm to "${CONFIRMATION_PHRASE}".`,
      );
    }
    if (!body.confirmedAt) {
      throw new BadRequestDomainException(
        ErrorCode.CONFIRMATION_REQUIRED,
        'Confirmation timestamp missing — set body.confirmedAt to an ISO-8601 UTC value.',
      );
    }
    const ts = Date.parse(body.confirmedAt);
    if (!Number.isFinite(ts)) {
      throw new BadRequestDomainException(
        ErrorCode.CONFIRMATION_REQUIRED,
        'Confirmation timestamp is not a valid ISO-8601 date.',
      );
    }
    if (Date.now() - ts > CONFIRMATION_WINDOW_SEC * 1000) {
      throw new BadRequestDomainException(
        ErrorCode.CONFIRMATION_EXPIRED,
        `Confirmation expired — re-confirm within the last ${CONFIRMATION_WINDOW_SEC} seconds.`,
      );
    }
    return true;
  }
}

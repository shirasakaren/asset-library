import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FastifyRequest } from 'fastify';
import { Observable, tap } from 'rxjs';
import { AuthenticatedRequestUser } from '../../infra/keycloak/keycloak-auth.guard';
import { AUDIT_ACTION_KEY, AuditActionConfig } from '../audit/audit-action.decorator';
import { AuditService } from '../audit/audit.service';

export const AUDIT_KEY = 'audit:action';

/**
 * Legacy shim kept so older Part 1 / 2 decorators still resolve. New code
 * should use `@AuditAction({ ... })` from `common/audit/audit-action.decorator`.
 */
export const Audit = (action: string) => SetMetadata(AUDIT_KEY, action);

/**
 * Resolves the subject id from a request given a dotted path like
 * `body.assetId` or `params.id`. Defaults to `params.id`.
 */
function resolveSubjectId(req: FastifyRequest, path = 'params.id'): string | null {
  const [section, ...rest] = path.split('.');
  const root =
    section === 'params'
      ? (req as unknown as { params: Record<string, unknown> }).params
      : section === 'body'
        ? (req as unknown as { body: Record<string, unknown> }).body
        : section === 'query'
          ? (req as unknown as { query: Record<string, unknown> }).query
          : undefined;
  if (!root) return null;
  if (rest.length === 0) return typeof root === 'string' ? root : null;
  let cursor: unknown = root;
  for (const part of rest) {
    if (!cursor || typeof cursor !== 'object') return null;
    cursor = (cursor as Record<string, unknown>)[part];
  }
  return typeof cursor === 'string' ? cursor : cursor != null ? String(cursor) : null;
}

/**
 * Reads `@AuditAction({ action, subjectType, subjectParam? })` and writes an
 * `AuditLog` row after the handler completes successfully. The actor is
 * pulled from `request.user` (set by `KeycloakAuthGuard`); anonymous-actor
 * audits (cron-driven, etc.) bypass the interceptor and call AuditService
 * directly.
 *
 * The `metadata` snapshot captures `params` + `body` minus obvious secrets.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const config = this.reflector.getAllAndOverride<AuditActionConfig | undefined>(
      AUDIT_ACTION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!config) return next.handle();

    const req = context.switchToHttp().getRequest<
      FastifyRequest & {
        user?: AuthenticatedRequestUser;
        body?: Record<string, unknown>;
        params?: Record<string, unknown>;
      }
    >();

    return next.handle().pipe(
      tap({
        next: () => {
          const subjectId = resolveSubjectId(req, config.subjectParam) ?? 'unknown';
          const metadata = this.buildMetadata(req);
          void this.audit.record({
            actorId: req.user?.user.id,
            action: config.action,
            subjectType: config.subjectType,
            subjectId,
            metadata,
          });
        },
      }),
    );
  }

  private buildMetadata(
    req: FastifyRequest & { body?: unknown; params?: unknown },
  ): Record<string, unknown> {
    const safe = (input: unknown): unknown => {
      if (!input || typeof input !== 'object') return input;
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
        if (/token|secret|password|pepper|keycloakAccessToken|deviceToken/i.test(k)) {
          out[k] = '[redacted]';
        } else {
          out[k] = v;
        }
      }
      return out;
    };
    return {
      params: safe(req.params),
      body: safe(req.body),
      method: req.method,
      url: req.url,
    };
  }
}

import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { AuthenticatedRequestUser } from '../../infra/keycloak/keycloak-auth.guard';

/**
 * Resolves the authenticated principal attached by an auth guard.
 *
 * Returns the principal when a guard has authenticated the request, and
 * `undefined` for guests on endpoints protected by `OptionalAuthGuard`
 * (e.g. `/assets`, `/discover`, asset detail — whose response shape varies
 * for guests). Endpoints that require a user pair this with
 * `KeycloakAuthGuard`, which rejects unauthenticated requests with 401, so
 * `req.user` is always present there.
 *
 * NOTE: previously this threw when `req.user` was missing, which crashed every
 * guest request to OptionalAuthGuard endpoints with a 500. The `| undefined`
 * return type keeps call sites honest at compile time instead.
 */
export const AuthUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedRequestUser | undefined => {
    const req = ctx
      .switchToHttp()
      .getRequest<FastifyRequest & { user?: AuthenticatedRequestUser }>();
    return req.user;
  },
);

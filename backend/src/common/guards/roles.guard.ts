import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FastifyRequest } from 'fastify';
import { AuthenticatedRequestUser } from '../../infra/keycloak/keycloak-auth.guard';
import { AppRole } from '../../infra/keycloak/role-resolver.service';
import { ROLES_KEY } from '../decorators/roles.decorator';

const ROLE_RANK: Record<AppRole, number> = { user: 0, contributor: 1, admin: 2 };

/**
 * Enforces `@Roles(...)` declarations. Authentication must already have run
 * (the request must carry `request.user`); pair with `KeycloakAuthGuard`.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<AppRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = context
      .switchToHttp()
      .getRequest<FastifyRequest & { user?: AuthenticatedRequestUser }>();
    const principal = req.user;
    if (!principal) {
      throw new ForbiddenException('No authenticated user.');
    }

    const minRank = Math.min(...required.map((r) => ROLE_RANK[r]));
    if (ROLE_RANK[principal.role as AppRole] < minRank) {
      throw new ForbiddenException(`Requires one of: ${required.join(', ')}.`);
    }
    return true;
  }
}

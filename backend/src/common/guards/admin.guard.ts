import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import {
  AuthenticatedRequestUser,
  KeycloakAuthGuard,
} from '../../infra/keycloak/keycloak-auth.guard';

/**
 * Composite guard for the `/admin/*` namespace: runs `KeycloakAuthGuard`
 * first, then refuses anything that isn't `isAdmin=true`.
 *
 * We deliberately do NOT accept plugin device tokens on admin endpoints —
 * the Unity/Unreal plugins are end-user surfaces and have no admin reach.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly keycloak: KeycloakAuthGuard) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const ok = await this.keycloak.canActivate(context);
    if (!ok) return false;
    const req = context
      .switchToHttp()
      .getRequest<FastifyRequest & { user?: AuthenticatedRequestUser }>();
    if (!req.user?.user.isAdmin) {
      throw new ForbiddenException('Admin role required.');
    }
    return true;
  }
}

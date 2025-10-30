import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FastifyRequest } from 'fastify';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { KeycloakAuthGuard } from './keycloak-auth.guard';
import { PluginTokenGuard, extractPluginToken } from './plugin-token.guard';

/**
 * Accepts either a Keycloak bearer token OR a plugin device token (recognized
 * by the `PluginToken` scheme). Delegates to the matching guard so the
 * downstream `request.user` shape is identical regardless of how the caller
 * authenticated.
 */
@Injectable()
export class FlexibleAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly keycloak: KeycloakAuthGuard,
    private readonly plugin: PluginTokenGuard,
  ) {}

  canActivate(context: ExecutionContext): Promise<boolean> | boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    if (extractPluginToken(req)) return this.plugin.canActivate(context);
    if (req.headers.authorization?.toLowerCase().startsWith('bearer ')) {
      return this.keycloak.canActivate(context);
    }
    throw new UnauthorizedException('No supported credential found.');
  }
}

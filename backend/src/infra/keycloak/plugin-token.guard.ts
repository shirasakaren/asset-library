import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FastifyRequest } from 'fastify';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { ErrorCode } from '../../common/errors/error-code';
import { DomainException } from '../../common/errors/problem.dto';
import { HttpStatus } from '@nestjs/common';
import { AuthenticatedRequestUser } from './keycloak-auth.guard';
import { PLUGIN_TOKEN_SCHEME, PluginTokenService } from './plugin-token.service';
import { RoleResolverService } from './role-resolver.service';

/**
 * Authenticates `Authorization: PluginToken <token>`. Plugin-only endpoints
 * (e.g. download initiation from the Unity/Unreal plugin) use this guard
 * directly; mixed endpoints use `FlexibleAuthGuard`.
 */
@Injectable()
export class PluginTokenGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly pluginTokens: PluginTokenService,
    private readonly roleResolver: RoleResolverService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const token = extractPluginToken(req);
    if (!token) {
      throw new UnauthorizedException('Missing plugin token.');
    }
    const verified = await this.pluginTokens.verifyAndTouch(token);
    if (!verified) {
      throw new DomainException(
        HttpStatus.UNAUTHORIZED,
        ErrorCode.AUTH_PLUGIN_TOKEN_INVALID,
        'Plugin token is invalid, expired, or revoked.',
      );
    }
    const role = await this.roleResolver.resolve(verified.user);
    (req as FastifyRequest & { user?: AuthenticatedRequestUser }).user = {
      user: verified.user,
      role,
      claims: { sub: verified.user.keycloakSub, email: verified.user.email },
    } as AuthenticatedRequestUser;
    return true;
  }
}

export function extractPluginToken(req: FastifyRequest): string | null {
  const raw = req.headers.authorization;
  if (!raw) return null;
  const [scheme, value] = raw.split(' ');
  if (scheme !== PLUGIN_TOKEN_SCHEME || !value) return null;
  return value.trim();
}

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { User } from '@prisma/client';
import { FastifyRequest } from 'fastify';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { KeycloakClaims, KeycloakJwksProvider } from './keycloak-jwks.provider';
import { PrincipalResolverService } from './principal-resolver.service';
import { AppRole } from './role-resolver.service';

export interface AuthenticatedRequestUser {
  user: User;
  role: AppRole;
  claims: KeycloakClaims;
}

/**
 * Verifies the `Authorization: Bearer <token>` header against Keycloak's JWKS,
 * resolves {user, role} via the shared (Redis-cached) PrincipalResolverService,
 * and attaches everything to `request.user`.
 *
 * Endpoints decorated with `@Public()` bypass verification entirely.
 */
@Injectable()
export class KeycloakAuthGuard implements CanActivate {
  private readonly logger = new Logger(KeycloakAuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly jwks: KeycloakJwksProvider,
    private readonly principals: PrincipalResolverService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const token = this.extractBearer(req);
    if (!token) {
      throw new UnauthorizedException('Missing bearer token.');
    }

    let claims: KeycloakClaims;
    try {
      claims = await this.jwks.verify(token);
    } catch (err) {
      this.logger.debug(`Token verification failed: ${(err as Error).message}`);
      throw new UnauthorizedException('Invalid or expired token.');
    }

    const resolved = await this.principals.resolvePrincipal(claims);

    (req as FastifyRequest & { user?: AuthenticatedRequestUser }).user = {
      user: resolved.user,
      role: resolved.role,
      claims,
    };
    return true;
  }

  private extractBearer(req: FastifyRequest): string | null {
    const raw = req.headers.authorization;
    if (!raw) return null;
    const [scheme, value] = raw.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !value) return null;
    return value.trim();
  }
}

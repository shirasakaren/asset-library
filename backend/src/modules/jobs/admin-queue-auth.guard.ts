import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Locale, User } from '@prisma/client';
import { FastifyRequest } from 'fastify';
import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { KeycloakClaims, KeycloakJwksProvider } from '../../infra/keycloak/keycloak-jwks.provider';
import { AuthenticatedRequestUser } from '../../infra/keycloak/keycloak-auth.guard';
import { AppRole, RoleResolverService } from '../../infra/keycloak/role-resolver.service';

/**
 * Guard for the bull-board mounted at /admin/queues. Bull-board is loaded by
 * direct browser navigation, so it cannot supply an `Authorization` header.
 * This guard therefore accepts the same Keycloak bearer either via the header
 * (e.g. when called from API code) **or** via an `?access_token=…` query
 * parameter that the admin-sidebar link injects when opening the dashboard.
 *
 * The handler additionally requires `principal.user.isAdmin === true`.
 */
@Injectable()
export class AdminQueueAuthGuard implements CanActivate {
  private readonly logger = new Logger(AdminQueueAuthGuard.name);

  constructor(
    private readonly jwks: KeycloakJwksProvider,
    private readonly prisma: PrismaService,
    private readonly roleResolver: RoleResolverService,
    private readonly config: AppConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const token = this.extractToken(req);
    if (!token) throw new UnauthorizedException('Missing bearer token.');

    let claims: KeycloakClaims;
    try {
      claims = await this.jwks.verify(token);
    } catch (err) {
      this.logger.debug(`Token verification failed: ${(err as Error).message}`);
      throw new UnauthorizedException('Invalid or expired token.');
    }

    const user = await this.upsertUser(claims);
    if (!user.isAdmin) {
      throw new ForbiddenException('Admins only.');
    }
    const role: AppRole = await this.roleResolver.resolve(user);
    (req as FastifyRequest & { user?: AuthenticatedRequestUser }).user = {
      user,
      role,
      claims,
    };
    return true;
  }

  private extractToken(req: FastifyRequest): string | null {
    const header = req.headers.authorization;
    if (header) {
      const [scheme, value] = header.split(' ');
      if (scheme?.toLowerCase() === 'bearer' && value) return value.trim();
    }
    const q = req.query as Record<string, string | string[] | undefined> | undefined;
    const fromQuery = q?.['access_token'];
    if (typeof fromQuery === 'string' && fromQuery.length > 0) return fromQuery;
    if (Array.isArray(fromQuery) && fromQuery.length > 0 && typeof fromQuery[0] === 'string') {
      return fromQuery[0];
    }
    return null;
  }

  private async upsertUser(claims: KeycloakClaims): Promise<User> {
    const email = (claims.email ?? '').toLowerCase();
    if (!email) {
      throw new UnauthorizedException('Keycloak token has no email claim.');
    }
    const displayName = claims.name ?? claims.preferred_username ?? email.split('@')[0];
    const isBootstrapAdmin = email === this.config.get('ADMIN_BOOTSTRAP_EMAIL').toLowerCase();
    return this.prisma.user.upsert({
      where: { keycloakSub: claims.sub },
      create: {
        keycloakSub: claims.sub,
        email,
        displayName,
        locale: Locale.en,
        isAdmin: isBootstrapAdmin,
      },
      update: {
        email,
        displayName,
        ...(isBootstrapAdmin ? { isAdmin: true } : {}),
      },
    });
  }
}

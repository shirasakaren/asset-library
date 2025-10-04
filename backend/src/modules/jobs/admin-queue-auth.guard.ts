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

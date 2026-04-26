import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Locale, User } from '@prisma/client';
import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { KeycloakClaims } from './keycloak-jwks.provider';
import { AppRole, RoleResolverService } from './role-resolver.service';

/** User with Date fields flattened to ISO strings for Redis JSON storage. */
type SerializedUser = Omit<User, 'createdAt' | 'updatedAt' | 'deletedAt'> & {
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

function serializeUser(u: User): SerializedUser {
  return {
    ...u,
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
    deletedAt: u.deletedAt ? u.deletedAt.toISOString() : null,
  };
}

function deserializeUser(u: SerializedUser): User {
  return {
    ...u,
    createdAt: new Date(u.createdAt),
    updatedAt: new Date(u.updatedAt),
    deletedAt: u.deletedAt ? new Date(u.deletedAt) : null,
  };
}

// Resolved-principal cache TTL. The token is ALWAYS verified (signature +
// expiry) by the caller before this runs; this only skips the per-request user
// upsert + role query when we've resolved the same Keycloak subject very
// recently. A role/admin change therefore takes up to this long to take effect.
const PRINCIPAL_CACHE_TTL_SEC = 30;

/**
 * Resolves {user, role} for an already-verified Keycloak token, caching the
 * resolution in Redis (keyed by the Keycloak subject) for a few seconds.
 *
 * Shared by the HTTP `KeycloakAuthGuard` and the `/ws` gateway so both paths
 * use the same cache key (`authz:principal:<sub>`) — an admin promote/demote
 * that invalidates the HTTP cache therefore invalidates the WS path too.
 */
@Injectable()
export class PrincipalResolverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly roleResolver: RoleResolverService,
    private readonly config: AppConfigService,
    private readonly redis: RedisService,
  ) {}

  static cacheKey(sub: string): string {
    return `authz:principal:${sub}`;
  }

  /**
   * Caching the resolution — not the verification — keeps token expiry strictly
   * enforced by the caller. Cache reads/writes are best-effort: a Redis failure
   * falls back to the Postgres upsert + role query.
   */
  async resolvePrincipal(claims: KeycloakClaims): Promise<{ user: User; role: AppRole }> {
    const cacheKey = PrincipalResolverService.cacheKey(claims.sub);
    try {
      const cached = await this.redis.client.get(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached) as { user: SerializedUser; role: AppRole };
        return { user: deserializeUser(parsed.user), role: parsed.role };
      }
    } catch {
      /* cache miss / parse error — fall through to the DB */
    }
    const user = await this.upsertUser(claims);
    const role = await this.roleResolver.resolve(user);
    try {
      await this.redis.client.set(
        cacheKey,
        JSON.stringify({ user: serializeUser(user), role }),
        'EX',
        PRINCIPAL_CACHE_TTL_SEC,
      );
    } catch {
      /* non-fatal — caching is best-effort */
    }
    return { user, role };
  }

  /**
   * First-sight upsert of the application's User row. Bootstraps the admin
   * flag when the email matches `ADMIN_BOOTSTRAP_EMAIL`; otherwise leaves the
   * stored `isAdmin` value untouched on subsequent logins.
   */
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

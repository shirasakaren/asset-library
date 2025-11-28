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

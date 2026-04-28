import { User } from '@prisma/client';
import { AppConfigService } from '../../src/config/app-config.service';
import { PrismaService } from '../../src/infra/prisma/prisma.service';
import { RedisService } from '../../src/infra/redis/redis.service';
import { KeycloakClaims } from '../../src/infra/keycloak/keycloak-jwks.provider';
import { PrincipalResolverService } from '../../src/infra/keycloak/principal-resolver.service';
import { RoleResolverService } from '../../src/infra/keycloak/role-resolver.service';

const CLAIMS: KeycloakClaims = {
  sub: 'kc-sub-1',
  email: 'user@labmgm.org',
  name: 'Test User',
} as KeycloakClaims;

function buildUser(): User {
  const now = new Date('2026-01-01T00:00:00.000Z');
  return {
    id: 'user-1',
    keycloakSub: 'kc-sub-1',
    email: 'user@labmgm.org',
    displayName: 'Test User',
    locale: 'en',
    isAdmin: false,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  } as User;
}

interface Mocks {
  service: PrincipalResolverService;
  get: jest.Mock;
  set: jest.Mock;
  upsert: jest.Mock;
  resolveRole: jest.Mock;
}

function build(overrides?: { get?: jest.Mock; set?: jest.Mock }): Mocks {
  const get = overrides?.get ?? jest.fn().mockResolvedValue(null);
  const set = overrides?.set ?? jest.fn().mockResolvedValue('OK');
  const upsert = jest.fn().mockResolvedValue(buildUser());
  const resolveRole = jest.fn().mockResolvedValue('user');

  const prisma = { user: { upsert } } as unknown as PrismaService;
  const roleResolver = { resolve: resolveRole } as unknown as RoleResolverService;
  const config = { get: () => 'admin-bootstrap@labmgm.org' } as unknown as AppConfigService;
  const redis = { client: { get, set } } as unknown as RedisService;

  const service = new PrincipalResolverService(prisma, roleResolver, config, redis);
  return { service, get, set, upsert, resolveRole };
}

describe('PrincipalResolverService', () => {
  it('uses the authz:principal:<sub> cache key namespace', () => {
    expect(PrincipalResolverService.cacheKey('abc')).toBe('authz:principal:abc');
  });

  it('returns the cached principal without hitting Postgres on a cache hit', async () => {
    const cached = {
      user: {
        ...buildUser(),
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        deletedAt: null,
      },
      role: 'admin',
    };
    const get = jest.fn().mockResolvedValue(JSON.stringify(cached));
    const { service, upsert, resolveRole } = build({ get });

    const result = await service.resolvePrincipal(CLAIMS);

    expect(result.user.id).toBe('user-1');
    expect(result.role).toBe('admin');
    expect(result.user.createdAt).toBeInstanceOf(Date);
    expect(upsert).not.toHaveBeenCalled();
    expect(resolveRole).not.toHaveBeenCalled();
  });

  it('falls back to Postgres + caches the result on a cache miss', async () => {
    const { service, get, set, upsert, resolveRole } = build();

    const result = await service.resolvePrincipal(CLAIMS);

    expect(get).toHaveBeenCalledWith('authz:principal:kc-sub-1');
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(resolveRole).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith('authz:principal:kc-sub-1', expect.any(String), 'EX', 30);
    expect(result.user.id).toBe('user-1');
    expect(result.role).toBe('user');
  });

  it('falls back to Postgres when the Redis read throws', async () => {
    const get = jest.fn().mockRejectedValue(new Error('redis down'));
    const { service, upsert } = build({ get });

    const result = await service.resolvePrincipal(CLAIMS);

    expect(upsert).toHaveBeenCalledTimes(1);
    expect(result.user.id).toBe('user-1');
  });

  it('does not fail the resolution when the Redis write throws', async () => {
    const set = jest.fn().mockRejectedValue(new Error('redis down'));
    const { service, upsert } = build({ set });

    const result = await service.resolvePrincipal(CLAIMS);

    expect(upsert).toHaveBeenCalledTimes(1);
    expect(result.user.id).toBe('user-1');
  });
});

import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../../src/common/guards/roles.guard';
import { AppRole } from '../../src/infra/keycloak/role-resolver.service';

function buildContext(role: AppRole | null, required: AppRole[] | undefined): ExecutionContext {
  const handler = () => undefined;
  const ctx = {
    getHandler: () => handler,
    getClass: () => class Dummy {},
    switchToHttp: () => ({
      getRequest: () => ({ user: role ? { user: {}, role, claims: {} } : undefined }),
    }),
  } as unknown as ExecutionContext;
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(required),
  } as unknown as Reflector;
  return Object.assign(ctx, { __reflector: reflector });
}

function buildGuard(required: AppRole[] | undefined): RolesGuard {
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(required),
  } as unknown as Reflector;
  return new RolesGuard(reflector);
}

describe('RolesGuard', () => {
  it('allows when no roles are declared', () => {
    const guard = buildGuard(undefined);
    expect(guard.canActivate(buildContext('user', undefined))).toBe(true);
  });

  it('grants admin access to admin-only endpoints', () => {
    const guard = buildGuard(['admin']);
    expect(guard.canActivate(buildContext('admin', ['admin']))).toBe(true);
  });

  it('rejects user-role principals from admin-only endpoints', () => {
    const guard = buildGuard(['admin']);
    expect(() => guard.canActivate(buildContext('user', ['admin']))).toThrow(ForbiddenException);
  });

  it('allows a contributor on a contributor-or-higher endpoint', () => {
    const guard = buildGuard(['contributor']);
    expect(guard.canActivate(buildContext('contributor', ['contributor']))).toBe(true);
  });
});

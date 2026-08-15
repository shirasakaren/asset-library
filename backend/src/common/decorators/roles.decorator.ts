import { SetMetadata } from '@nestjs/common';
import { AppRole } from '../../infra/keycloak/role-resolver.service';

export const ROLES_KEY = 'auth:roles';

/**
 * Declares the minimum set of application roles required to invoke a handler.
 * Enforcement happens in `RolesGuard`.
 */
export const Roles = (...roles: AppRole[]) => SetMetadata(ROLES_KEY, roles);

import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'auth:isPublic';

/**
 * Marks an endpoint as accessible without a Keycloak bearer token.
 * Used by /healthz, /readyz, and the public /about content.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

import { Injectable } from '@nestjs/common';
import { createRemoteJWKSet, JWTPayload, jwtVerify, JWTVerifyGetKey } from 'jose';
import { AppConfigService } from '../../config/app-config.service';

/**
 * Verified Keycloak access-token claims that downstream code can rely on.
 */
export interface KeycloakClaims extends JWTPayload {
  sub: string;
  email?: string;
  email_verified?: boolean;
  preferred_username?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
}

/**
 * Lazily-initialized JWKS verifier. The `createRemoteJWKSet` helper from `jose`
 * caches keys in-memory and refreshes them when an unknown `kid` is seen, so we
 * just hold a single resolver per process.
 */
@Injectable()
export class KeycloakJwksProvider {
  private readonly issuer: string;
  private readonly audience: string;
  private readonly algorithms: string[];
  private readonly clockToleranceSec: number;
  private readonly jwks: JWTVerifyGetKey;

  constructor(config: AppConfigService) {
    this.issuer = config.get('KEYCLOAK_ISSUER_URL');
    this.audience = config.get('KEYCLOAK_AUDIENCE');
    this.algorithms = config.get('KEYCLOAK_ALGORITHMS');
    this.clockToleranceSec = config.get('KEYCLOAK_CLOCK_TOLERANCE_SEC');
    this.jwks = createRemoteJWKSet(new URL(config.get('KEYCLOAK_JWKS_URI')), {
      cacheMaxAge: config.get('KEYCLOAK_JWKS_CACHE_TTL_SEC') * 1000,
    });
  }

  /**

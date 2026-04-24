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
   * Verifies a Keycloak-issued bearer token end-to-end (signature, issuer,
   * audience, expiry with configurable skew). Throws on any failure so the
   * guard can map it to a 401.
   */
  async verify(token: string): Promise<KeycloakClaims> {
    // Signature, issuer, algorithm and expiry are still enforced by jose. We do
    // NOT pass `audience` here because Keycloak access tokens default to
    // aud:"account" unless a dedicated "Audience" protocol mapper is added to
    // the client. Instead we accept the token when it is demonstrably intended
    // for this resource server: either its `aud` contains our audience, or its
    // authorized party (`azp`) is our client. This keeps verification strict
    // without requiring extra Keycloak configuration.
    const { payload } = await jwtVerify(token, this.jwks, {
      issuer: this.issuer,
      algorithms: this.algorithms,
      clockTolerance: this.clockToleranceSec,
    });
    if (!payload.sub) {
      throw new Error('Keycloak token is missing the `sub` claim.');
    }
    const audiences = Array.isArray(payload.aud) ? payload.aud : payload.aud ? [payload.aud] : [];
    const azp = typeof payload.azp === 'string' ? payload.azp : undefined;
    if (!audiences.includes(this.audience) && azp !== this.audience) {
      throw new Error(
        `Keycloak token not intended for this client (aud=${JSON.stringify(payload.aud)}, azp=${String(azp)}, expected=${this.audience}).`,
      );
    }
    return payload as KeycloakClaims;
  }
}

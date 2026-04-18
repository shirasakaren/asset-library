/// <reference lib="dom" />
import { Test } from '@nestjs/testing';
import { JWTPayload, SignJWT, exportJWK, generateKeyPair } from 'jose';
import { KeycloakJwksProvider } from '../../../src/infra/keycloak/keycloak-jwks.provider';

/**
 * Stands up an in-process Keycloak verifier override. The E2E suite uses
 * `Test.overrideProvider(KeycloakJwksProvider).useValue(FakeKeycloak)` so
 * we can issue valid-looking access tokens without booting a real KC.
 */
export class FakeKeycloak {
  private privateKey?: CryptoKey;
  readonly issuer = 'https://test-keycloak.local/realms/mgm';
  readonly audience = 'mgm-asset-library';

  private async ensureKey(): Promise<CryptoKey> {
    if (this.privateKey) return this.privateKey;
    const { privateKey } = await generateKeyPair('RS256');
    this.privateKey = privateKey as CryptoKey;
    return this.privateKey;
  }

  async mintToken(sub: string, email: string, displayName = email): Promise<string> {
    const key = await this.ensureKey();
    return new SignJWT({
      email,
      preferred_username: email.split('@')[0],
      name: displayName,
    })
      .setProtectedHeader({ alg: 'RS256' })
      .setSubject(sub)
      .setIssuer(this.issuer)
      .setAudience(this.audience)
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(key);
  }

  /** Override that returns the decoded claims for any token we just minted. */
  asProvider(): KeycloakJwksProvider {
    const verify = async (token: string): Promise<JWTPayload> => {
      const { jwtVerify } = await import('jose');
      const key = await this.ensureKey();
      const publicJwk = await exportJWK(key);
      const { payload } = await jwtVerify(token, publicJwk, {
        audience: this.audience,
        issuer: this.issuer,
      });
      return payload;
    };
    return { verify } as unknown as KeycloakJwksProvider;
  }
}

/**
 * Build a Nest testing module that swaps the real KeycloakJwksProvider with
 * the fake. Call from any scenario that needs to mint tokens.
 */
export async function buildTestModuleWithFakeKeycloak() {
  const fake = new FakeKeycloak();
  const builder = Test.createTestingModule({
    imports: [(await import('../../../src/app.module')).AppModule],
  });
  builder.overrideProvider(KeycloakJwksProvider).useValue(fake.asProvider());
  return { fake, builder };
}

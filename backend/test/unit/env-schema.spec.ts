import { validateEnv } from '../../src/config/env.schema';

const baseEnv: NodeJS.ProcessEnv = {
  NODE_ENV: 'development',
  PUBLIC_BASE_URL: 'http://localhost:4000',
  DATABASE_URL: 'postgresql://mgm:mgm@localhost:5432/db?schema=public',
  MONGO_URL: 'mongodb://localhost:27017/db',
  REDIS_URL: 'redis://localhost:6379',
  KEYCLOAK_ISSUER_URL: 'http://localhost/realms/mgm',
  KEYCLOAK_AUDIENCE: 'mgm-asset-library',
  KEYCLOAK_JWKS_URI: 'http://localhost/realms/mgm/protocol/openid-connect/certs',
  S3_ACCESS_KEY_ID: 'dummy',
  S3_SECRET_ACCESS_KEY: 'dummy',
  S3_BUCKET_ASSETS: 'a',
  S3_BUCKET_THUMBS: 't',
  S3_BUCKET_EDITOR_MEDIA: 'e',
  MEILI_URL: 'http://localhost:7700',
};

describe('config/env.schema', () => {
  it('parses a minimal valid environment', () => {
    const env = validateEnv(baseEnv);
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(4000);
    expect(env.CORS_ORIGINS).toContain('http://localhost:3000');
  });

  it('coerces CORS_ORIGINS from a comma-separated string', () => {
    const env = validateEnv({ ...baseEnv, CORS_ORIGINS: 'https://a.test, https://b.test' });
    expect(env.CORS_ORIGINS).toEqual(['https://a.test', 'https://b.test']);
  });

  it('requires PLUGIN_TOKEN_PEPPER in production', () => {
    expect(() => validateEnv({ ...baseEnv, NODE_ENV: 'production' })).toThrow(
      /PLUGIN_TOKEN_PEPPER/,
    );
  });

  it('rejects malformed URLs with a helpful message', () => {
    expect(() => validateEnv({ ...baseEnv, KEYCLOAK_ISSUER_URL: 'not-a-url' })).toThrow(
      /KEYCLOAK_ISSUER_URL/,
    );
  });
});

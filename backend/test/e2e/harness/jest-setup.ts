/**
 * Default env that points the E2E suite at docker-compose.test.yml. Override
 * locally by exporting any of these before running `pnpm test:e2e`.
 */
process.env.NODE_ENV ??= 'staging';
process.env.PROCESS_ROLE ??= 'api';
process.env.PORT ??= '4099';
process.env.DATABASE_URL ??=
  'postgresql://mgm:mgm@localhost:5432/mgm_asset_library_e2e?schema=public';
process.env.MONGO_URL ??= 'mongodb://localhost:27017/mgm_asset_library_e2e';
process.env.REDIS_URL ??= 'redis://localhost:6379/9';
process.env.KEYCLOAK_ISSUER_URL ??= 'https://test-keycloak.local/realms/mgm';
process.env.KEYCLOAK_AUDIENCE ??= 'mgm-asset-library';
process.env.KEYCLOAK_JWKS_URI ??=
  'https://test-keycloak.local/realms/mgm/protocol/openid-connect/certs';
process.env.PUBLIC_BASE_URL ??= 'http://localhost:4099';
process.env.S3_REGION ??= 'us-east-1';
process.env.S3_ENDPOINT ??= 'http://localhost:9000';
process.env.S3_ACCESS_KEY_ID ??= 'mgm';
process.env.S3_SECRET_ACCESS_KEY ??= 'mgm-secret';
process.env.S3_FORCE_PATH_STYLE ??= 'true';
process.env.S3_BUCKET_ASSETS ??= 'mgm-e2e-assets';
process.env.S3_BUCKET_THUMBS ??= 'mgm-e2e-thumbs';
process.env.S3_BUCKET_EDITOR_MEDIA ??= 'mgm-e2e-editor';
process.env.MEILI_URL ??= 'http://localhost:7700';
process.env.PLUGIN_TOKEN_PEPPER ??= 'test-pepper-1234567890';
process.env.ADMIN_BOOTSTRAP_EMAIL ??= 'admin@labmgm.org';
process.env.FEATURE_QUEUE_DASHBOARD ??= 'false';

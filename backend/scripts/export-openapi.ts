/**
 * Boots the Nest app just enough to render the OpenAPI document, then writes
 * it to `openapi.json` at the repo root. CI verifies this file is current
 * (no uncommitted diff) so the frontend codegen stays honest.
 */

import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import 'reflect-metadata';
import { AppModule } from '../src/app.module';

async function main(): Promise<void> {
  // Signal infrastructure services to skip live connections during this export.
  process.env.OPENAPI_EXPORT = '1';
  // Fill in minimal env so the config schema validates during this CLI run.
  process.env.PUBLIC_BASE_URL ??= 'http://localhost:4000';
  process.env.DATABASE_URL ??= 'postgresql://mgm:mgm@localhost:5432/db?schema=public';
  process.env.MONGO_URL ??= 'mongodb://localhost:27017/db';
  process.env.REDIS_URL ??= 'redis://localhost:6379';
  process.env.KEYCLOAK_ISSUER_URL ??= 'http://localhost/realms/mgm';
  process.env.KEYCLOAK_AUDIENCE ??= 'mgm-asset-library';
  process.env.KEYCLOAK_JWKS_URI ??= 'http://localhost/realms/mgm/protocol/openid-connect/certs';
  process.env.S3_ACCESS_KEY_ID ??= 'dummy';
  process.env.S3_SECRET_ACCESS_KEY ??= 'dummy';
  process.env.S3_BUCKET_ASSETS ??= 'a';
  process.env.S3_BUCKET_THUMBS ??= 't';
  process.env.S3_BUCKET_EDITOR_MEDIA ??= 'e';
  process.env.MEILI_URL ??= 'http://localhost:7700';

  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    logger: false,
    abortOnError: false,
  });

  const doc = new DocumentBuilder()
    .setTitle('MGM Asset Library API')
    .setDescription('REST API for the MGM Asset Library — feature complete (Parts 1 + 2 + 3 + 4).')
    .setVersion('1.0.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'keycloak')
    .build();
  const document = SwaggerModule.createDocument(app, doc);
  const out = resolve(__dirname, '..', 'openapi.json');
  writeFileSync(out, JSON.stringify(document, null, 2) + '\n', 'utf8');
  // eslint-disable-next-line no-console
  console.log(`[openapi] wrote ${out}`);
  await app.close();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[openapi] failed:', err);
  process.exit(1);
});

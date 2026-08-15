import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import compress from '@fastify/compress';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from '../../../src/app.module';

/**
 * Boots the full Nest app against whatever `process.env` is pointing at
 * (typically the docker-compose.test.yml stack). Reused by every E2E
 * scenario. Sinks logs to /dev/null so test output isn't drowned.
 */
export async function buildTestApp(): Promise<NestFastifyApplication> {
  process.env.NODE_ENV ??= 'staging';
  process.env.LOG_LEVEL ??= 'error';

  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = module.createNestApplication<NestFastifyApplication>(
    new FastifyAdapter({ logger: false, trustProxy: true }),
  );
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(compress);
  await app.register(cookie);
  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });
  await app.register(cors, { origin: '*', credentials: false });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

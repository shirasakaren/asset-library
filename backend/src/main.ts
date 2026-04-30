import compress from '@fastify/compress';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { WsAdapter } from '@nestjs/platform-ws';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger as PinoLogger } from 'nestjs-pino';
import 'reflect-metadata';
import { AppModule } from './app.module';
import { WorkerModule } from './app.worker.module';
import { validateEnv } from './config/env.schema';
import { initSentry } from './infra/sentry/sentry.service';

/**
 * Process entrypoint. Branches on PROCESS_ROLE:
 *
 *   - `api`    → full HTTP + WebSocket app, no BullMQ workers.
 *   - `worker` → boots WorkerModule (registers all processors) plus a
 *                small Fastify server that exposes only /healthz and
 *                /metrics for orchestration / Prometheus scraping.
 *
 * Sentry is initialized *before* Nest comes up so unhandled errors during
 * bootstrap are still captured.
 */
async function bootstrap(): Promise<void> {
  const env = validateEnv(process.env);
  initSentry({
    dsn: env.SENTRY_DSN,
    environment: env.SENTRY_ENVIRONMENT,
    tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE,
  });

  if (env.PROCESS_ROLE === 'worker') {
    await bootstrapWorker(env);
  } else {
    await bootstrapApi(env);
  }
}

async function bootstrapApi(env: ReturnType<typeof validateEnv>): Promise<void> {
  const adapter = new FastifyAdapter({
    trustProxy: env.TRUST_PROXY,
    bodyLimit: 10 * 1024 * 1024,
    // Honour inbound X-Request-Id when SWAG / a sibling service supplied one;
    // otherwise Fastify mints a v4 UUID we surface to clients + Pino logs.
    genReqId: (req: import('http').IncomingMessage) => {
      const inbound = req.headers['x-request-id'];
      const value = Array.isArray(inbound) ? inbound[0] : inbound;
      return value && value.length <= 200
        ? value
        : `req_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    },
  });
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter);
  app.useWebSocketAdapter(new WsAdapter(app));
  app.useLogger(app.get(PinoLogger));
  // Helmet defaults are tight; CSP is scoped narrowly because Swagger UI on
  // /docs needs inline scripts + styles to run.
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
      },
    },
    strictTransportSecurity:
      env.NODE_ENV === 'production'
        ? { maxAge: 63_072_000, includeSubDomains: true, preload: false }
        : false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  });
  await app.register(compress);
  await app.register(cookie);
  // 10 MB inline body cap — large uploads always go direct to S3 via
  // presigned URLs (Part 2 file pipeline).
  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });
  await app.register(cors, {
    origin: env.CORS_ORIGINS,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
    allowedHeaders: ['authorization', 'content-type', 'idempotency-key', 'x-request-id'],
    exposedHeaders: [
      'x-request-id',
      'retry-after',
      'x-total-draft',
      'x-total-published',
      'x-total-archived',
      'x-total-deleted',
    ],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.enableShutdownHooks();

  const swaggerEnabled = env.NODE_ENV !== 'production' || env.FEATURE_SWAGGER_PUBLIC;
  if (swaggerEnabled) {
    const doc = new DocumentBuilder()
      .setTitle('MGM Asset Library API')
      .setDescription('REST API for the MGM Asset Library.')
      .setVersion('0.3.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'keycloak')
      .build();
    const document = SwaggerModule.createDocument(app, doc);
    SwaggerModule.setup('docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  await app.listen({ port: env.PORT, host: '0.0.0.0' });
  new Logger('Bootstrap').log(
    `MGM Asset Library API listening on ${env.PUBLIC_BASE_URL} (port ${env.PORT}, env=${env.NODE_ENV}, role=api).`,
  );
}

/**
 * Worker mode boots the same Nest container with a different module that:
 *   - Registers all BullMQ processors.
 *   - Skips the public controllers, swagger, CORS, etc.
 *   - Exposes a minimal HTTP surface for /healthz and /metrics.
 */
async function bootstrapWorker(env: ReturnType<typeof validateEnv>): Promise<void> {
  const adapter = new FastifyAdapter({ trustProxy: env.TRUST_PROXY });
  const app = await NestFactory.create<NestFastifyApplication>(WorkerModule, adapter, {
    bufferLogs: true,
  });
  app.useLogger(app.get(PinoLogger));
  app.enableShutdownHooks();
  await app.listen({ port: env.PORT, host: '0.0.0.0' });
  new Logger('Bootstrap').log(
    `MGM Asset Library worker online (port ${env.PORT}, env=${env.NODE_ENV}, role=worker).`,
  );
}

bootstrap().catch((err) => {
  // fs.writeSync(2, ...) is a synchronous write to stderr (fd 2) — unlike
  // process.stderr.write() it cannot be interrupted by process.exit().
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('fs').writeSync(
    2,
    `Fatal bootstrap error: ${err instanceof Error ? err.stack : String(err)}\n`,
  );
  process.exit(1);
});

import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { AuditCoreModule } from './common/audit/audit.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { IdempotencyModule } from './common/idempotency/idempotency.module';
import { AppConfigModule } from './config/app-config.module';
import { AppConfigService } from './config/app-config.service';
import { KeycloakModule } from './infra/keycloak/keycloak.module';
import { MailerModule } from './infra/mailer/mailer.module';
import { MeilisearchModule } from './infra/meilisearch/meilisearch.module';
import { MongoModule } from './infra/mongo/mongo.module';
import { N8nModule } from './infra/n8n/n8n.module';
import { PrismaModule } from './infra/prisma/prisma.module';
import { RedisModule } from './infra/redis/redis.module';
import { S3Module } from './infra/s3/s3.module';
import { SentryModule } from './infra/sentry/sentry.module';
import { WorkerHealthModule } from './health/worker-health.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ProcessorsModule } from './modules/jobs/processors/processors.module';
import { MetricsModule } from './modules/metrics/metrics.module';

/**
 * Worker-mode container. Boots the bare minimum infra needed for queue
 * processors plus a small HTTP surface for /healthz and /metrics. Public
 * REST controllers and the WebSocket gateway are deliberately absent.
 */
@Module({
  imports: [
    AppConfigModule,
    LoggerModule.forRootAsync({
      imports: [AppConfigModule],
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        pinoHttp: {
          level: config.get('LOG_LEVEL'),
          transport: config.isDevelopment
            ? { target: 'pino-pretty', options: { singleLine: true } }
            : undefined,
          base: { role: 'worker' },
        },
      }),
    }),
    SentryModule,
    PrismaModule,
    MongoModule,
    RedisModule,
    S3Module,
    MeilisearchModule,
    MailerModule,
    N8nModule,
    KeycloakModule,
    AuditCoreModule,
    IdempotencyModule,
    JobsModule,
    NotificationsModule,
    ProcessorsModule,
    MetricsModule,
    WorkerHealthModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
})
export class WorkerModule {}

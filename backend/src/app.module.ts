import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { AuditCoreModule } from './common/audit/audit.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { GuardsModule } from './common/guards/guards.module';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { IdempotencyModule } from './common/idempotency/idempotency.module';
import { RateLimitModule } from './common/rate-limit/rate-limit.module';
import { RequestIdMiddleware } from './common/request-id/request-id.middleware';
import { AppConfigModule } from './config/app-config.module';
import { AppConfigService } from './config/app-config.service';
import { HealthModule } from './health/health.module';
import { KeycloakModule } from './infra/keycloak/keycloak.module';
import { MailerModule } from './infra/mailer/mailer.module';
import { MeilisearchModule } from './infra/meilisearch/meilisearch.module';
import { MongoModule } from './infra/mongo/mongo.module';
import { N8nModule } from './infra/n8n/n8n.module';
import { PrismaModule } from './infra/prisma/prisma.module';
import { RedisModule } from './infra/redis/redis.module';
import { S3Module } from './infra/s3/s3.module';
import { SentryModule } from './infra/sentry/sentry.module';
// Active modules (Part 1)
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
// Stubbed modules — empty bodies until their respective parts land.
import { AdminModule } from './modules/admin/admin.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { AssetsModule } from './modules/assets/assets.module';
import { AuditModule } from './modules/audit/audit.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { CommentsModule } from './modules/comments/comments.module';
import { DownloadsModule } from './modules/downloads/downloads.module';
import { FeaturedModule } from './modules/featured/featured.module';
import { FilesModule } from './modules/files/files.module';
import { GifsModule } from './modules/gifs/gifs.module';
import { IssuesModule } from './modules/issues/issues.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { MetricsModule } from './modules/metrics/metrics.module';
import { LibraryModule } from './modules/library/library.module';
import { LicensesModule } from './modules/licenses/licenses.module';
import { MeModule } from './modules/me/me.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ReportsModule } from './modules/reports/reports.module';
import { RequestsModule } from './modules/requests/requests.module';
import { SearchModule } from './modules/search/search.module';
import { TagsModule } from './modules/tags/tags.module';
import { VersionsModule } from './modules/versions/versions.module';
import { WsModule } from './modules/ws/ws.module';

@Module({
  imports: [
    // ── Config & logging ────────────────────────────────────────────────────
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
          redact: ['req.headers.authorization', 'req.headers.cookie'],
          customProps: (req) => ({ reqId: (req as unknown as { id?: string }).id }),
        },
      }),
    }),

    // ── Infra (shared connectors) ───────────────────────────────────────────
    SentryModule,
    PrismaModule,
    MongoModule,
    RedisModule,
    S3Module,
    MeilisearchModule,
    MailerModule,
    N8nModule,
    KeycloakModule,
    GuardsModule,
    AuditCoreModule,
    IdempotencyModule,
    RateLimitModule,

    // ── Health ──────────────────────────────────────────────────────────────
    HealthModule,

    // ── Active feature modules (Part 1) ─────────────────────────────────────
    UsersModule,
    AuthModule,

    // ── Stubbed feature modules (Parts 2/3/4) ───────────────────────────────
    AssetsModule,
    VersionsModule,
    FilesModule,
    GifsModule,
    DownloadsModule,
    CategoriesModule,
    TagsModule,
    LicensesModule,
    LibraryModule,
    CommentsModule,
    IssuesModule,
    ReportsModule,
    RequestsModule,
    FeaturedModule,
    NotificationsModule,
    AnalyticsModule,
    AdminModule,
    AuditModule,
    SearchModule,
    JobsModule,
    MetricsModule,
    MeModule,
    WsModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}

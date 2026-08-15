import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AppConfigModule } from '../../config/app-config.module';
import { AppConfigService } from '../../config/app-config.service';
import { MongoHealthService } from './mongo-health.service';

/**
 * Mongoose connection module. We only reach for Mongo when the schema is
 * genuinely variable (analysis_reports, webhook_deliveries, search_audit) —
 * everything else lives in Postgres via Prisma.
 */
@Global()
@Module({
  imports: [
    MongooseModule.forRootAsync({
      imports: [AppConfigModule],
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        uri: config.get('MONGO_URL'),
        ...(process.env.OPENAPI_EXPORT === '1' && { lazyConnection: true }),
      }),
    }),
  ],
  providers: [MongoHealthService],
  exports: [MongooseModule, MongoHealthService],
})
export class MongoModule {}

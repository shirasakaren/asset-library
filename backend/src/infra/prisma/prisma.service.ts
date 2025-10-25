import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AppConfigService } from '../../config/app-config.service';

/**
 * PrismaClient lifecycle-bound to the Nest container. Use this service rather
 * than instantiating PrismaClient directly so connections are released on
 * shutdown.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: AppConfigService) {
    super({
      datasources: {
        db: { url: config.get('DATABASE_URL') },
      },
      log: config.isDevelopment ? ['warn', 'error'] : ['error'],
    });
  }

  async onModuleInit(): Promise<void> {
    if (process.env.OPENAPI_EXPORT === '1') return;
    await this.$connect();
    this.logger.log('Connected to PostgreSQL.');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /** Lightweight readiness probe used by /readyz. */
  async ping(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch (err) {
      this.logger.error('Postgres ping failed', err as Error);
      return false;
    }
  }
}

import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { MeilisearchService } from '../infra/meilisearch/meilisearch.service';
import { MongoHealthService } from '../infra/mongo/mongo-health.service';
import { PrismaService } from '../infra/prisma/prisma.service';
import { RedisService } from '../infra/redis/redis.service';
import { S3Service } from '../infra/s3/s3.service';

export interface ReadinessReport {
  status: 'ok' | 'degraded';
  checks: Record<string, boolean>;
  timestamp: string;
}

@ApiTags('health')
@Controller()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly mongo: MongoHealthService,
    private readonly meili: MeilisearchService,
    private readonly s3: S3Service,
  ) {}

  /**
   * Liveness probe. 200 as long as the process can accept HTTP — does not
   * touch downstream dependencies.
   */
  @Public()
  @Get('healthz')
  @ApiOkResponse({ description: 'Always 200 when the process is up.' })
  liveness(): { status: 'ok' } {
    return { status: 'ok' };
  }

  /**
   * Readiness probe. 200 only if every external dependency is reachable;
   * returns a per-check breakdown so ops can identify which subsystem is down.
   */
  @Public()
  @Get('readyz')
  async readiness(): Promise<ReadinessReport> {
    const [postgres, redis, mongo, meilisearch, s3] = await Promise.all([
      this.prisma.ping(),
      this.redis.ping(),
      this.mongo.ping(),
      this.meili.ping(),
      this.s3.ping(),
    ]);
    const checks = { postgres, redis, mongo, meilisearch, s3 };
    const allGreen = Object.values(checks).every(Boolean);
    return {
      status: allGreen ? 'ok' : 'degraded',
      checks,
      timestamp: new Date().toISOString(),
    };
  }
}

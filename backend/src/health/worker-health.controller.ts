import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { MongoHealthService } from '../infra/mongo/mongo-health.service';
import { PrismaService } from '../infra/prisma/prisma.service';
import { RedisService } from '../infra/redis/redis.service';
import { S3Service } from '../infra/s3/s3.service';

export interface WorkerReadinessReport {
  status: 'ok' | 'degraded';
  checks: Record<string, boolean>;
  timestamp: string;
}

@ApiTags('health')
@Controller()
export class WorkerHealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly mongo: MongoHealthService,
    private readonly s3: S3Service,
  ) {}

  /** Always-200 liveness so orchestrators don't reap the container on a flake. */
  @Public()
  @Get('healthz')
  @ApiOperation({ summary: 'Worker liveness probe.' })
  @ApiOkResponse()
  liveness(): { status: 'ok'; role: 'worker' } {
    return { status: 'ok', role: 'worker' };
  }

  /** Readiness — checks every external dependency the worker needs. */
  @Public()
  @Get('readyz')
  async readiness(): Promise<WorkerReadinessReport> {
    const [postgres, redis, mongo, s3] = await Promise.all([
      this.prisma.ping(),
      this.redis.ping(),
      this.mongo.ping(),
      this.s3.ping(),
    ]);
    const checks = { postgres, redis, mongo, s3 };
    const allGreen = Object.values(checks).every(Boolean);
    return {
      status: allGreen ? 'ok' : 'degraded',
      checks,
      timestamp: new Date().toISOString(),
    };
  }
}

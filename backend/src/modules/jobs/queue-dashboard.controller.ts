import { Controller, ForbiddenException, Get, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { FastifyAdapter as BullFastifyAdapter } from '@bull-board/fastify';
import { FastifyReply, FastifyRequest } from 'fastify';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthenticatedRequestUser } from '../../infra/keycloak/keycloak-auth.guard';
import { AppConfigService } from '../../config/app-config.service';
import { AdminQueueAuthGuard } from './admin-queue-auth.guard';
import { JobsProducer } from './jobs.producer';

/**
 * Admin-only operational UI mounted at `/admin/queues`. We hand-roll the
 * Fastify plugin registration here because @bull-board/nestjs expects
 * Express; the Fastify adapter is wired into the underlying http server.
 *
 * Gated behind FEATURE_QUEUE_DASHBOARD and the admin role.
 */
@ApiTags('Admin')
@ApiBearerAuth('keycloak')
@Controller()
@UseGuards(AdminQueueAuthGuard)
export class QueueDashboardController {
  private readonly adapter: BullFastifyAdapter | null;

  constructor(
    private readonly producer: JobsProducer,
    config: AppConfigService,
  ) {
    if (!config.get('FEATURE_QUEUE_DASHBOARD')) {
      this.adapter = null;
      return;
    }
    this.adapter = new BullFastifyAdapter();
    createBullBoard({
      queues: this.producer.listQueues().map((q) => new BullMQAdapter(q)),
      serverAdapter: this.adapter,
    });
    this.adapter.setBasePath('/admin/queues');
  }


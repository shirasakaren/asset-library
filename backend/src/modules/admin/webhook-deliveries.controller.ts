import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Model } from 'mongoose';
import { AdminGuard } from '../../common/guards/admin.guard';
import { WebhookDelivery } from '../jobs/processors/webhook/webhook-delivery.schema';

type LeanDelivery = {
  deliveryId: string;
  event: string;
  status: 'queued' | 'success' | 'failure';
  attempt: number;
  httpStatus?: number;
  durationMs?: number;
  responseBody?: string;
  requestEnvelope?: Record<string, unknown>;
  error?: string;
  createdAt: Date;
};

interface AdminWebhookDeliveryDto {
  id: string;
  type: string;
  status: 'success' | 'failure' | 'pending';
  recipient: string;
  attempt: number;
  durationMs: number | null;
  requestBody: unknown;
  responseStatus: number | null;
  responseHeaders: Record<string, string> | null;
  responseBodyExcerpt: string | null;
  createdAt: string;
}

interface AdminWebhookPageDto {
  items: AdminWebhookDeliveryDto[];
  pageInfo: { hasMore: boolean; nextCursor: string | null };
}

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

@ApiTags('Admin')
@ApiBearerAuth('keycloak')
@Controller('admin/webhook-deliveries')
@UseGuards(AdminGuard)
export class WebhookDeliveriesController {
  constructor(@InjectModel(WebhookDelivery.name) private readonly model: Model<WebhookDelivery>) {}

  @Get()
  @ApiOperation({ summary: 'Recent n8n webhook delivery attempts (admin only).' })
  @ApiQuery({ name: 'status', required: false, enum: ['success', 'failure', 'pending'] })
  @ApiQuery({ name: 'type', required: false })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiOkResponse()
  async list(
    @Query('status') status?: 'success' | 'failure' | 'pending',
    @Query('type') type?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Promise<AdminWebhookPageDto> {
    const where: Record<string, unknown> = {};
    if (status) {
      // Frontend uses 'pending' as the user-facing label; the schema stores 'queued'.
      where.status = status === 'pending' ? 'queued' : status;
    }
    if (type) where.event = type;
    if (cursor) {
      // Cursor is the createdAt ISO timestamp of the last returned row.
      const parsed = parseCursor(cursor);
      if (parsed) where.createdAt = { $lt: parsed };
    }
    const take = Math.min(Math.max(Number(limit ?? DEFAULT_LIMIT), 1), MAX_LIMIT);

    const rows = (await this.model
      .find(where)
      .sort({ createdAt: -1 })

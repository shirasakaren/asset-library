import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

/**
 * Per-attempt log for outbound n8n webhooks. TTL-indexed on `createdAt` so
 * the collection self-trims after WEBHOOK_LOG_RETENTION_DAYS.
 */
@Schema({ collection: 'webhook_deliveries', timestamps: { createdAt: true, updatedAt: false } })
export class WebhookDelivery extends Document {
  @Prop({ index: true }) deliveryId!: string;
  @Prop({ index: true }) event!: string;
  @Prop({ index: true }) status!: 'queued' | 'success' | 'failure';
  @Prop() attempt!: number;
  @Prop() httpStatus?: number;
  @Prop() durationMs?: number;
  @Prop() responseBody?: string;
  @Prop({ type: Object }) requestEnvelope!: Record<string, unknown>;
  @Prop() error?: string;
  @Prop() createdAt!: Date;
}

export const WebhookDeliverySchema = SchemaFactory.createForClass(WebhookDelivery);

WebhookDeliverySchema.index({ deliveryId: 1, attempt: 1 }, { unique: true });
// TTL is set at module-init time once we know WEBHOOK_LOG_RETENTION_DAYS.

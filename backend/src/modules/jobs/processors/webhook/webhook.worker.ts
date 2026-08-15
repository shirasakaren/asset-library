import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Job } from 'bullmq';
import { Model } from 'mongoose';
import { createHmac, randomUUID } from 'node:crypto';
import { AppConfigService } from '../../../../config/app-config.service';
import { SentryService } from '../../../../infra/sentry/sentry.service';
import { WebhookDeliveryJob } from '../../contracts';
import { QUEUE } from '../../queue-names';
import { JobWorkerBase } from '../../worker-base';
import { WebhookDelivery } from './webhook-delivery.schema';

/**
 * Signs an envelope with HMAC-SHA256 and POSTs it to `N8N_WEBHOOK_URL`. Every
 * attempt is persisted into Mongo `webhook_deliveries` so admins can debug
 * failures via the `GET /admin/webhook-deliveries` endpoint.
 *
 * The job carries `WebhookDeliveryJob`; the envelope sent on the wire is
 * built here so its shape stays consistent across callers.
 */
@Injectable()
export class WebhookWorker extends JobWorkerBase<WebhookDeliveryJob> implements OnModuleInit {
  private readonly url: string;
  private readonly secret: string;

  constructor(
    config: AppConfigService,
    sentry: SentryService,
    @InjectModel(WebhookDelivery.name) private readonly deliveries: Model<WebhookDelivery>,
  ) {
    super(QUEUE.WEBHOOK, config, sentry);
    this.url = config.get('N8N_WEBHOOK_URL');
    this.secret = config.get('N8N_WEBHOOK_SECRET');
  }

  override async onModuleInit(): Promise<void> {
    super.onModuleInit();
    // Apply TTL — Mongo accepts repeat `createIndex` calls so this is safe.
    const retentionDays = this.config.get('WEBHOOK_LOG_RETENTION_DAYS');
    await this.deliveries.collection
      .createIndex({ createdAt: 1 }, { expireAfterSeconds: retentionDays * 86400 })
      .catch((err) =>
        this.logger.warn(`Could not set webhook_deliveries TTL: ${(err as Error).message}`),
      );
  }

  override async process(job: Job<WebhookDeliveryJob>): Promise<void> {
    if (!this.url) {
      this.logger.debug('N8N_WEBHOOK_URL blank — webhook is a no-op.');
      return;
    }

    const deliveryId = (job.id?.startsWith('wh_') ? job.id : `wh_${randomUUID()}`).toString();
    const attempt = job.attemptsMade + 1;

    const envelope = {
      id: deliveryId,
      type: job.data.event,
      createdAt: new Date().toISOString(),
      actor: job.data.actor,
      recipient: job.data.recipient,
      payload: job.data.payload,
    };
    const body = JSON.stringify(envelope);
    const signature = this.secret
      ? `sha256=${createHmac('sha256', this.secret).update(body).digest('hex')}`
      : '';

    const start = Date.now();
    let httpStatus: number | undefined;
    let responseBody = '';
    let error: string | undefined;
    let success = false;
    try {
      const res = await fetch(this.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-mgm-signature': signature,
          'x-mgm-delivery-id': deliveryId,
          'x-mgm-attempt': attempt.toString(),
        },
        body,
      });
      httpStatus = res.status;
      responseBody = (await res.text()).slice(0, 2000);
      success = res.ok;
      if (!success) error = `HTTP ${res.status}`;
    } catch (err) {
      error = (err as Error).message;
    }

    await this.deliveries.create({
      deliveryId,
      attempt,
      event: job.data.event,
      status: success ? 'success' : 'failure',
      httpStatus,
      durationMs: Date.now() - start,
      responseBody,
      requestEnvelope: envelope,
      error,
    });

    if (!success) throw new Error(error ?? 'Webhook delivery failed');
  }
}

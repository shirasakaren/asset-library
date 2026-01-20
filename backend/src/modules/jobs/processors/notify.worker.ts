import { Injectable } from '@nestjs/common';
import { Job } from 'bullmq';
import { User } from '@prisma/client';
import { AppConfigService } from '../../../config/app-config.service';
import { MailerService } from '../../../infra/mailer/mailer.service';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { SentryService } from '../../../infra/sentry/sentry.service';
import { JobsProducer } from '../jobs.producer';
import { NotifyJob } from '../contracts';
import { QUEUE } from '../queue-names';
import { JobWorkerBase } from '../worker-base';
import { EmailRendererService } from '../../notifications/email-renderer.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { WsFanoutService } from '../../notifications/ws-fanout.service';

/**
 * Fans out a single notification event into:
 *   1. In-app inbox row (always)
 *   2. WebSocket envelope via Redis pub/sub
 *   3. Email via Mailtrap (locale-resolved)
 *   4. n8n webhook (enqueued onto the webhook queue)
 *
 * Each channel runs in parallel with independent error handling — a broken
 * email transport must not delay the in-app insert. The in-app row is the
 * source of truth; the others are best-effort.
 */
@Injectable()
export class NotifyWorker extends JobWorkerBase<NotifyJob> {
  constructor(
    config: AppConfigService,
    sentry: SentryService,
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly emails: EmailRendererService,
    private readonly mailer: MailerService,
    private readonly wsFanout: WsFanoutService,
    private readonly jobs: JobsProducer,
  ) {
    super(QUEUE.NOTIFY, config, sentry);
  }

  async process(job: Job<NotifyJob>): Promise<void> {
    const data = job.data;
    const drop = new Set(data.dropChannels ?? []);
    const recipient = await this.prisma.user.findUnique({ where: { id: data.recipientUserId } });
    if (!recipient || recipient.deletedAt) {
      this.logger.debug(`Skipping notify — recipient ${data.recipientUserId} missing/deleted.`);
      return;
    }

    const inAppPromise = drop.has('inApp')
      ? Promise.resolve(null)
      : this.notifications.insertInApp(recipient.id, data.type, data.payload).catch((err) => {
          this.sentry.captureException(err, { channel: 'inApp', userId: recipient.id });
          return null;
        });

    const wsPromise = drop.has('ws')
      ? Promise.resolve()
      : this.publishWs(recipient.id, data).catch((err) =>
          this.sentry.captureException(err, { channel: 'ws', userId: recipient.id }),
        );

    const emailPromise = drop.has('email')
      ? Promise.resolve()
      : this.sendEmail(recipient, data).catch((err) =>
          this.sentry.captureException(err, { channel: 'email', userId: recipient.id }),
        );

    const webhookPromise = drop.has('webhook')
      ? Promise.resolve()
      : this.jobs
          .enqueueWebhook({
            event: data.type,
            recipient: { id: recipient.id, email: recipient.email },
            actor: data.actor,
            payload: data.payload,
          })
          .catch((err) =>
            this.sentry.captureException(err, { channel: 'webhook', userId: recipient.id }),
          );

    await Promise.all([inAppPromise, wsPromise, emailPromise, webhookPromise]);
  }

  private async publishWs(userId: string, data: NotifyJob): Promise<void> {
    const envelope = this.notifications.newWsEnvelope('notification:new', {
      type: data.type,
      payload: data.payload,
    });

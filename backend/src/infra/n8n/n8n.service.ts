import { Injectable, Logger } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { AppConfigService } from '../../config/app-config.service';

/**
 * Outbound webhook to n8n. Every body is HMAC-SHA256 signed with
 * `N8N_WEBHOOK_SECRET`; consumers verify the `X-MGM-Signature` header.
 * Calls become no-ops when N8N_WEBHOOK_URL is blank.
 *
 * Part 3 wraps this with retry + persistence in `webhook_deliveries`.
 */
@Injectable()
export class N8nService {
  private readonly logger = new Logger(N8nService.name);
  private readonly url: string;
  private readonly secret: string;

  constructor(config: AppConfigService) {
    this.url = config.get('N8N_WEBHOOK_URL');
    this.secret = config.get('N8N_WEBHOOK_SECRET');
  }

  get enabled(): boolean {
    return Boolean(this.url);
  }

  async send(event: string, payload: Record<string, unknown>): Promise<void> {
    if (!this.enabled) {
      this.logger.debug(`[n8n-noop] ${event}`);
      return;
    }
    const body = JSON.stringify({ event, payload, ts: Date.now() });
    const signature = this.secret
      ? createHmac('sha256', this.secret).update(body).digest('hex')
      : '';
    try {
      const res = await fetch(this.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-mgm-event': event,
          'x-mgm-signature': signature,
        },
        body,
      });
      if (!res.ok) {
        this.logger.warn(`n8n webhook returned ${res.status} for event=${event}`);
      }
    } catch (err) {
      this.logger.error(`n8n webhook failed for event=${event}`, err as Error);
    }
  }
}

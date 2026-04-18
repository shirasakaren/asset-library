import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { createTransport, Transporter } from 'nodemailer';
import { AppConfigService } from '../../config/app-config.service';

/**
 * Nodemailer transport for Mailtrap (dev/staging) or any SMTP relay (prod).
 * Becomes a no-op when SMTP_HOST is blank, so dev environments without an SMTP
 * relay still boot cleanly.
 */
@Injectable()
export class MailerService implements OnModuleDestroy {
  private readonly logger = new Logger(MailerService.name);
  private readonly transporter: Transporter | null;
  private readonly from: string;
  private readonly enabled: boolean;

  constructor(config: AppConfigService) {
    const host = config.get('SMTP_HOST');
    this.from = config.get('SMTP_FROM');
    this.enabled = Boolean(host);

    this.transporter = this.enabled
      ? createTransport({
          host,
          port: config.get('SMTP_PORT'),
          secure: config.get('SMTP_PORT') === 465,
          auth: config.get('SMTP_USER')
            ? { user: config.get('SMTP_USER'), pass: config.get('SMTP_PASS') }
            : undefined,
        })
      : null;

    if (!this.enabled) {
      this.logger.warn('SMTP_HOST is blank — MailerService is a no-op.');
    }
  }

  async send(opts: {
    to: string | string[];
    subject: string;
    html: string;
    text?: string;
  }): Promise<void> {
    if (!this.transporter) {
      this.logger.debug(`[mail-noop] to=${opts.to} subject=${opts.subject}`);
      return;
    }
    await this.transporter.sendMail({
      from: this.from,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    });
  }

  onModuleDestroy(): void {
    this.transporter?.close();
  }
}

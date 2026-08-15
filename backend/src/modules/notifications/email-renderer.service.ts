import { Injectable, Logger } from '@nestjs/common';
import { Locale, NotificationType } from '@prisma/client';
import mjml2html from 'mjml';
import { BRAND, FOOTER_MJML, HEADER_MJML } from './templates/_shared';
import { EMAIL_SPECS, EmailSpec } from './templates/template-spec';

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/**
 * Builds the final email body from a declarative `EmailSpec` per event. The
 * MJML wrapper is identical across events; variables are substituted with the
 * tiny `{{key}}` syntax (no helpers, no logic — keep payloads explicit).
 */
@Injectable()
export class EmailRendererService {
  private readonly logger = new Logger(EmailRendererService.name);
  private readonly htmlCache = new Map<string, string>();

  async render(
    type: NotificationType,
    locale: Locale,
    vars: Record<string, unknown>,
  ): Promise<RenderedEmail> {
    const spec = EMAIL_SPECS[type];
    if (!spec) throw new Error(`No email spec for notification type ${type}`);
    const html = await this.compileHtml(type, spec, locale);
    const substituted = this.substitute(html, vars);
    return {
      subject: this.substitute(spec.subject[locale] ?? spec.subject.en, vars),
      html: substituted,
      text: this.htmlToText(substituted),
    };
  }

  private async compileHtml(
    type: NotificationType,
    spec: EmailSpec,
    locale: Locale,
  ): Promise<string> {
    const cacheKey = `${type}:${locale}`;
    const cached = this.htmlCache.get(cacheKey);
    if (cached) return cached;

    const eyebrow = this.pickLocale(spec.eyebrow, locale);
    const title = this.pickLocale(spec.title, locale);
    const body = this.pickLocale(spec.body, locale)
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .join('<br/>');
    const cta = spec.cta
      ? `
        <mj-section background-color="#FFFFFF">
          <mj-column>
            <mj-button href="${spec.cta.href}" background-color="${BRAND.blue}" color="#FFFFFF" font-weight="600" inner-padding="14px 28px">
              ${this.pickLocale(spec.cta.label, locale)}
            </mj-button>
          </mj-column>
        </mj-section>
      `
      : '';

    const mjml = `
      <mjml>
        <mj-head>
          <mj-attributes>
            <mj-all font-family="Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif" />
          </mj-attributes>
        </mj-head>
        <mj-body background-color="${BRAND.surface}">
          ${HEADER_MJML}
          <mj-section background-color="#FFFFFF">
            <mj-column>
              <mj-text font-size="12px" color="#525252" text-transform="uppercase" letter-spacing="0.08em" padding-bottom="4px">
                ${eyebrow}
              </mj-text>
              <mj-text font-size="22px" font-weight="700" color="${BRAND.ink}" line-height="1.3">
                ${title}
              </mj-text>
              <mj-text font-size="15px" color="${BRAND.ink}" line-height="1.5">
                ${body}
              </mj-text>
            </mj-column>
          </mj-section>
          ${cta}
          ${FOOTER_MJML}
        </mj-body>
      </mjml>
    `.trim();

    const compiled = await mjml2html(mjml, { validationLevel: 'soft' });
    if (compiled.errors.length) {
      this.logger.warn(
        `MJML warnings for ${type}/${locale}: ${compiled.errors.map((e: { message: string }) => e.message).join('; ')}`,
      );
    }
    this.htmlCache.set(cacheKey, compiled.html);
    return compiled.html;
  }

  private pickLocale(field: { en: string; id: string }, locale: Locale): string {
    return field[locale] ?? field.en;
  }

  private substitute(template: string, vars: Record<string, unknown>): string {
    return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path: string) => {
      const value = path.split('.').reduce<unknown>((acc, key) => {
        if (acc && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
          return (acc as Record<string, unknown>)[key];
        }
        return undefined;
      }, vars);
      return value == null ? '' : String(value);
    });
  }

  private htmlToText(html: string): string {
    return html
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<br\s*\/?>(\r?\n)?/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n\s*\n+/g, '\n\n')
      .trim();
  }
}

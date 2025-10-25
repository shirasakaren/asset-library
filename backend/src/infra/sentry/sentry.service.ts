import { Injectable } from '@nestjs/common';
import * as Sentry from '@sentry/node';

export interface SentryBootstrapOptions {
  dsn: string;
  environment: string;
  tracesSampleRate: number;
}

/**
 * Sentry bootstrap. `initSentry()` MUST be invoked from main.ts before the
 * Nest app is created so unhandled errors during boot are captured. When DSN
 * is blank we register no transport — calls become safe no-ops.
 */
let initialized = false;

export function initSentry(opts: SentryBootstrapOptions): void {
  if (!opts.dsn) return;
  Sentry.init({
    dsn: opts.dsn,
    environment: opts.environment,
    tracesSampleRate: opts.tracesSampleRate,
  });
  initialized = true;
}

@Injectable()
export class SentryService {
  get isInitialized(): boolean {
    return initialized;
  }

  captureException(err: unknown, ctx?: Record<string, unknown>): void {
    if (!initialized) return;
    Sentry.captureException(err, ctx ? { extra: ctx } : undefined);
  }

  async flush(timeoutMs = 2000): Promise<void> {
    if (!initialized) return;
    await Sentry.flush(timeoutMs);
  }
}

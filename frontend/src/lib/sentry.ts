import { publicEnv } from './env.public';

export const sentryEnabled = Boolean(publicEnv.NEXT_PUBLIC_SENTRY_DSN);

export async function initBrowserSentry() {
  if (!sentryEnabled || typeof window === 'undefined') return;
  const Sentry = await import('@sentry/nextjs');
  Sentry.init({
    dsn: publicEnv.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
  });
}

export async function captureException(err: unknown, context?: Record<string, unknown>) {
  if (!sentryEnabled) return;
  const Sentry = await import('@sentry/nextjs');
  Sentry.captureException(err, context ? { extra: context } : undefined);
}

export async function addBreadcrumb(message: string, data?: Record<string, unknown>) {
  if (!sentryEnabled) return;
  const Sentry = await import('@sentry/nextjs');
  Sentry.addBreadcrumb({ message, data, level: 'info' });
}

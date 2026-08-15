import { logger } from './logger';
import { addBreadcrumb } from './sentry';

/**
 * Structured client analytics events. Server-side this is also safe to call.
 * Goes to Sentry as a breadcrumb + the JSON logger.
 */
export function logEvent(name: string, payload?: Record<string, unknown>) {
  logger.info(`event.${name}`, payload);
  void addBreadcrumb(`event.${name}`, payload);
}

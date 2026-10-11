import { logger } from './logger';

/**
 * Structured client analytics events, written to the JSON logger.
 */
export function logEvent(name: string, payload?: Record<string, unknown>) {
  logger.info(`event.${name}`, payload);
}

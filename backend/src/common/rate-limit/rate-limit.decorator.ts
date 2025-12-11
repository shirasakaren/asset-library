import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { RateLimitGuard } from './rate-limit.guard';

export const RATE_LIMIT_KEY = 'rate-limit:config';

export type RateLimitScope = 'user' | 'ip' | 'global';

export interface RateLimitConfig {
  /** Window length in seconds. */
  windowSec: number;
  /** Max events permitted inside the window. */
  max: number;
  /** Identity key — user (authenticated principal), ip, or global. */
  scope: RateLimitScope;
  /** Identifier used in keys + error messages. Defaults to handler name. */
  name?: string;
}

/**
 * Tags a handler for the global `RateLimitGuard`. Backed by Redis fixed-window
 * counters; cheap enough to apply to any abuse-prone surface. See Part 4 §17.1.
 *
 * Example:
 *   @RateLimit({ windowSec: 86400, max: 5, scope: 'user', name: 'reports.create' })
 *   create(...)
 */
export const RateLimit = (config: RateLimitConfig) =>
  applyDecorators(SetMetadata(RATE_LIMIT_KEY, config), UseGuards(RateLimitGuard));

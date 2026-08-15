import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { ConfirmationGuard } from './confirmation.guard';

export const CONFIRMATION_KEY = 'confirmation:required';
export const CONFIRMATION_PHRASE = 'I understand';
export const CONFIRMATION_WINDOW_SEC = 60;

/**
 * Stamps an admin handler as requiring an explicit two-step confirmation in
 * the request body:
 *
 *   {
 *     "confirm": "I understand",
 *     "confirmedAt": "2026-05-20T03:00:00.000Z",
 *     ...rest of the body
 *   }
 *
 * `confirmedAt` must be within the last 60 seconds — protects against an
 * accidental replay of a stale confirmation.
 */
export const RequireConfirmation = () =>
  applyDecorators(SetMetadata(CONFIRMATION_KEY, true), UseGuards(ConfirmationGuard));

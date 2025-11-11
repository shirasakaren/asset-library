import { createHash } from 'node:crypto';

export interface ResolvedAvatar {
  initials: string;
  bgColor: string;
  fgColor: string;
}

/**
 * Brand palette used for generated initial-only avatars. Pairs are chosen so
 * the foreground always has WCAG-AA contrast on the background.
 */
const PALETTE: Array<{ bg: string; fg: string }> = [
  { bg: 'brand-blue', fg: 'ink-white' },
  { bg: 'brand-yellow', fg: 'ink-black' },
  { bg: 'brand-red', fg: 'ink-white' },
  { bg: 'brand-green', fg: 'ink-black' },
];

/** Up-to-two-character initials derived from displayName or email local-part. */
export function computeInitials(displayName: string | null | undefined, email: string): string {
  const source = (displayName && displayName.trim()) || email.split('@')[0];
  const parts = source.split(/\s+|[._-]/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Deterministic colour pick keyed off `userId`. */
export function resolveAvatar(
  userId: string,
  displayName: string | null | undefined,
  email: string,
): ResolvedAvatar {
  const digest = createHash('sha256').update(userId).digest();
  const slot = digest[0] % PALETTE.length;
  const palette = PALETTE[slot];
  return {
    initials: computeInitials(displayName, email),
    bgColor: palette.bg,
    fgColor: palette.fg,
  };
}

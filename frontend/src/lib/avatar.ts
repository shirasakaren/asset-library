import { hashString } from './utils';

export interface AvatarTokens {
  initials: string;
  bgColor: string;
  fgColor: string;
}

// Brand palette per DS §2.2. Yellow doesn't carry text on white, so we
// pair it with ink text (DS §2.4); the others use white text.
const PALETTE: Array<{ bg: string; fg: string }> = [
  { bg: '#3a6dc5', fg: '#ffffff' },
  { bg: '#f7bf33', fg: '#0e1116' },
  { bg: '#f94141', fg: '#ffffff' },
  { bg: '#0f8657', fg: '#ffffff' },
];

export function computeInitials(name: string): string {
  const cleaned = (name || '').trim();
  if (!cleaned) return '?';
  if (cleaned.includes('@')) {
    return cleaned[0]!.toUpperCase();
  }
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0]!.slice(0, 2).toUpperCase();
  }
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export function getAvatarTokens(input: {
  id: string;
  displayName: string;
  email?: string;
}): AvatarTokens {
  const initials = computeInitials(input.displayName || input.email || input.id);
  const idx = hashString(input.id || input.email || input.displayName || 'anon') % PALETTE.length;
  const { bg, fg } = PALETTE[idx]!;
  return { initials, bgColor: bg, fgColor: fg };
}

// Convert a server-provided semantic color name ("brand-blue") to a hex.
const NAME_TO_HEX: Record<string, string> = {
  'brand-blue': '#3a6dc5',
  'brand-yellow': '#f7bf33',
  'brand-red': '#f94141',
  'brand-green': '#0f8657',
};
const FG_TO_HEX: Record<string, string> = {
  'ink-white': '#ffffff',
  'ink-black': '#0e1116',
};

export function avatarFromServer(input: {
  initials: string;
  bgColor: string;
  fgColor: string;
}): AvatarTokens {
  return {
    initials: input.initials,
    bgColor: NAME_TO_HEX[input.bgColor] ?? input.bgColor,
    fgColor: FG_TO_HEX[input.fgColor] ?? input.fgColor ?? '#ffffff',
  };
}

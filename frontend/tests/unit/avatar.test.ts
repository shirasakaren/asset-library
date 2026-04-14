import { describe, it, expect } from 'vitest';
import { computeInitials, getAvatarTokens, avatarFromServer } from '@/lib/avatar';

describe('computeInitials', () => {
  it('takes first two letters for a single-word name', () => {
    expect(computeInitials('Mira')).toBe('MI');
  });
  it('takes the first letter of first and last for multi-word names', () => {
    expect(computeInitials('Mira Lestari')).toBe('ML');
  });
  it('falls back to first character of email', () => {
    expect(computeInitials('mira@labmgm.org')).toBe('M');
  });
  it('returns ? for empty input', () => {
    expect(computeInitials('')).toBe('?');
  });
});

describe('getAvatarTokens', () => {
  it('is deterministic on the same id', () => {
    const a = getAvatarTokens({ id: 'abc', displayName: 'Test User' });
    const b = getAvatarTokens({ id: 'abc', displayName: 'Test User' });
    expect(a).toEqual(b);
  });
  it('picks readable foreground on yellow', () => {
    // any of the 4 palette entries — assert yellow always pairs with ink.
    const palette = ['1', '2', '3', '4', '5', '6'].map((id) =>
      getAvatarTokens({ id, displayName: 'X' }),
    );
    for (const p of palette) {
      if (p.bgColor === '#f7bf33') expect(p.fgColor).toBe('#0e1116');
    }
  });
});

describe('avatarFromServer', () => {
  it('maps semantic color names to hex', () => {
    const res = avatarFromServer({ initials: 'AB', bgColor: 'brand-blue', fgColor: 'ink-white' });
    expect(res.bgColor).toBe('#3a6dc5');
    expect(res.fgColor).toBe('#ffffff');
  });
});

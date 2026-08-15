import { appendSlugSuffix, slugify } from '../../src/modules/assets/slug';

describe('slug', () => {
  it('lowercases, strips punctuation, hyphenates spaces', () => {
    expect(slugify('Crazy Sci-Fi Sword Pack!')).toBe('crazy-sci-fi-sword-pack');
  });

  it('handles non-ASCII via NFKD', () => {
    expect(slugify('Übersicht')).toBe('ubersicht');
  });

  it('falls back to a random suffix on empty input', () => {
    expect(slugify('')).toMatch(/^[0-9a-f]{8}$/);
  });

  it('caps length at 80', () => {
    expect(slugify('a'.repeat(200)).length).toBeLessThanOrEqual(80);
  });

  it('appendSlugSuffix tacks on 4 hex chars', () => {
    expect(appendSlugSuffix('foo')).toMatch(/^foo-[0-9a-f]{4}$/);
  });
});

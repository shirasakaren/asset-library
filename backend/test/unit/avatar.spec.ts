import { computeInitials, resolveAvatar } from '../../src/common/avatar/avatar';

describe('avatar', () => {
  it('takes first letters of first + last word', () => {
    expect(computeInitials('Idham Pratama', 'idham@x')).toBe('IP');
  });

  it('falls back to email local-part when displayName is empty', () => {
    expect(computeInitials('', 'idham.pratama@x.com')).toBe('IP');
  });

  it('returns ? for genuinely empty inputs', () => {
    expect(computeInitials(null, '@')).toBe('?');
  });

  it('picks the same brand color twice for the same userId', () => {
    const a = resolveAvatar('cln-abc', 'X Y', 'x@y');
    const b = resolveAvatar('cln-abc', 'X Y', 'x@y');
    expect(a).toEqual(b);
  });

  it('picks one of the four brand palette colors', () => {
    const palette = ['brand-blue', 'brand-yellow', 'brand-red', 'brand-green'];
    for (let i = 0; i < 20; i++) {
      const v = resolveAvatar(`cln-${i}`, 'X', 'x@y');
      expect(palette).toContain(v.bgColor);
    }
  });
});

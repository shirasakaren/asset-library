import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { CategoryIcon, CATEGORY_ICON_KEYS } from '@/components/admin/category-icon';
import categories from '@/preview/seed-data/categories.json';

describe('CategoryIcon', () => {
  it('renders an svg glyph for every iconKey used by the seed categories', () => {
    const keys = [...new Set((categories as { iconKey: string | null }[]).map((c) => c.iconKey))];
    expect(keys.length).toBeGreaterThan(5);
    for (const key of keys) {
      expect(CATEGORY_ICON_KEYS, `mapped key ${key}`).toContain(key);
      const { container, unmount } = render(<CategoryIcon iconKey={key} />);
      const svg = container.querySelector('svg');
      expect(svg, `icon for ${key}`).not.toBeNull();
      expect(svg).toHaveAttribute('aria-hidden', 'true');
      unmount();
    }
  });

  it('maps known keys to distinct glyphs and unknown or missing keys to the generic one', () => {
    const html = (key: string | null) => render(<CategoryIcon iconKey={key} />).container.innerHTML;
    expect(html('box')).not.toBe(html('music'));
    const fallback = html(null);
    expect(fallback).not.toBe(html('box'));
    expect(html('does-not-exist')).toBe(fallback);
    expect(html('')).toBe(fallback);
    expect(fallback).toContain('<svg');
  });

  it('is case-insensitive', () => {
    const a = render(<CategoryIcon iconKey="Palette" />).container.innerHTML;
    const b = render(<CategoryIcon iconKey="palette" />).container.innerHTML;
    expect(a).toBe(b);
  });
});

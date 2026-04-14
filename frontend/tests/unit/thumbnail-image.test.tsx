import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ThumbnailImage } from '@/components/asset/thumbnail-image';

describe('ThumbnailImage', () => {
  it('uses src when both src and fallback are present', () => {
    const { container } = render(
      <ThumbnailImage src="https://example.com/a.png" fallback="https://example.com/b.png" alt="A" />,
    );
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toContain('a.png');
  });

  it('uses fallback when src is missing', () => {
    const { container } = render(
      <ThumbnailImage src={null} fallback="https://example.com/auto.png" alt="A" />,
    );
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toContain('auto.png');
  });

  it('renders the brand-tinted placeholder when no src or fallback', () => {
    const { container } = render(<ThumbnailImage src={null} fallback={null} alt="Demo asset" />);
    expect(container.querySelector('img')).toBeNull();
    // Placeholder uses uppercase initials
    expect(container.textContent).toContain('DA');
  });
});

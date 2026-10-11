import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Logo } from '@/components/brand/logo';
import { GeometricPattern } from '@/components/brand/geometric-pattern';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('brand assets under a base path', () => {
  it('Logo src carries the base path', () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_PATH', '/asset-library');
    const { container } = render(<Logo />);
    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      '/asset-library/brand/mgm-logo.svg',
    );
  });

  it('Logo src is unchanged at the root', () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_PATH', '');
    const { container } = render(<Logo />);
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/brand/mgm-logo.svg');
  });

  it('every pattern tile carries the base path', () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_PATH', '/asset-library');
    const { container } = render(<GeometricPattern variant="square" seed="x" />);
    const srcs = [...container.querySelectorAll('img')].map((i) => i.getAttribute('src'));
    expect(srcs).toHaveLength(9);
    for (const s of srcs) expect(s).toMatch(/^\/asset-library\/patterns\/p-\d+\.svg$/);
  });

  it('pattern tiles are unchanged at the root', () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_PATH', '');
    const { container } = render(<GeometricPattern variant="corner" seed="x" />);
    for (const i of container.querySelectorAll('img')) {
      expect(i.getAttribute('src')).toMatch(/^\/patterns\/p-\d+\.svg$/);
    }
  });
});

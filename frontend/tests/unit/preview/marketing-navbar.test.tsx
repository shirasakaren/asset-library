import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { MarketingNavbar } from '@/components/layout/navbar';

beforeAll(() => {
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  );
});

describe('MarketingNavbar', () => {
  it('labels its CTA "Open the preview" (not "Discover") and links to the app', () => {
    render(<MarketingNavbar />);
    const cta = screen.getByRole('link', { name: 'common.openPreview' });
    expect(cta).toHaveAttribute('href', '/');
    expect(screen.queryByText('nav.discover')).not.toBeInTheDocument();
  });
});

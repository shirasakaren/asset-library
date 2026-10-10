import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/preview', () => ({ resetDemo: vi.fn(async () => {}) }));
vi.mock('@/preview/navigate', () => ({ goHomeWithReload: vi.fn() }));
vi.mock('@/components/ui/toaster', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { AttributionNotice } from '@/components/preview/attribution-notice';
import { Footer } from '@/components/layout/footer';

describe('AttributionNotice', () => {
  it('has a mailto takedown contact and an external GitHub link', () => {
    render(<AttributionNotice />);
    expect(screen.getByText(/preview\.attributionLead/)).toBeInTheDocument();
    const mail = screen.getByRole('link', { name: 'it@labmgm.org' });
    expect(mail).toHaveAttribute('href', 'mailto:it@labmgm.org');
    const gh = screen.getByRole('link', { name: 'preview.sourceOnGithub' });
    expect(gh).toHaveAttribute('href', 'https://github.com/shirasakaren/asset-library');
    expect(gh).toHaveAttribute('target', '_blank');
    expect(gh).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByText(/preview\.staticDemo/)).toBeInTheDocument();
  });
});

describe('Footer', () => {
  it('renders the attribution notice and a Reset demo data control', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Footer />
      </QueryClientProvider>,
    );
    const footer = screen.getByRole('contentinfo');
    expect(within(footer).getByRole('link', { name: 'it@labmgm.org' })).toHaveAttribute(
      'href',
      'mailto:it@labmgm.org',
    );
    // no community URLs configured in the preview: no bare heading either
    expect(within(footer).queryByText('nav.community')).not.toBeInTheDocument();
    const reset = within(footer).getByRole('button', { name: 'preview.resetDemo' });
    await userEvent.setup().click(reset);
    expect(screen.getByText('preview.resetConfirmTitle')).toBeInTheDocument();
  });

  it('has no dead links: every href is an existing route, an https URL or the takedown mailto', () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Footer />
      </QueryClientProvider>,
    );
    const footer = screen.getByRole('contentinfo');
    const hrefs = within(footer)
      .getAllByRole('link')
      .map((a) => a.getAttribute('href') ?? '');
    expect(hrefs.length).toBeGreaterThan(4);
    for (const href of hrefs) {
      if (href.startsWith('https://') || href.startsWith('mailto:')) continue;
      expect(href, 'no placeholder or fragment-only targets').toMatch(/^\/[^#]*$/);
      expect(routeExists(href), `${href} is a page of the app`).toBe(true);
    }
    // Items without a page stay visible as plain text, not as links.
    for (const key of ['team', 'press', 'privacy', 'terms', 'cookies']) {
      expect(within(footer).getByText(`footer.${key}`).closest('a')).toBeNull();
    }
  });
});

/** True when `src/app` has a `page.tsx` for the path (route groups like `(app)` do not count). */
function routeExists(path: string): boolean {
  const segments = path.split('/').filter(Boolean);
  const walk = (dir: string, rest: string[]): boolean => {
    if (rest.length === 0 && existsSync(join(dir, 'page.tsx'))) return true;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (rest.length === 0 && !/^\(.+\)$/.test(entry.name)) continue;
      if (!entry.isDirectory()) continue;
      if (/^\(.+\)$/.test(entry.name) && walk(join(dir, entry.name), rest)) return true;
      if (entry.name === rest[0] && walk(join(dir, entry.name), rest.slice(1))) return true;
    }
    return false;
  };
  return walk(join(process.cwd(), 'src', 'app'), segments);
}

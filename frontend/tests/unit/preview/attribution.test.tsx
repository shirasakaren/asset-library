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
    const reset = within(footer).getByRole('button', { name: 'preview.resetDemo' });
    await userEvent.setup().click(reset);
    expect(screen.getByText('preview.resetConfirmTitle')).toBeInTheDocument();
  });
});

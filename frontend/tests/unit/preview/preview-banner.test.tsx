import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// Echo the key plus any values so the persona name can be asserted.
vi.mock('next-intl', () => ({
  useTranslations: (scope: string) => (key: string, values?: Record<string, unknown>) =>
    values ? `${scope}.${key}:${JSON.stringify(values)}` : `${scope}.${key}`,
}));
vi.mock('@/preview/session/me-provider', () => ({
  useMe: () => ({ displayName: 'Aria Wijaya' }),
}));
const persistence = { value: true };
vi.mock('@/preview/persistence', () => ({ usePersistenceState: () => persistence.value }));
const resetDemo = vi.fn(async () => {});
vi.mock('@/preview', () => ({ resetDemo: () => resetDemo() }));
const goHome = vi.fn();
vi.mock('@/preview/navigate', () => ({ goHomeWithReload: () => goHome() }));
vi.mock('@/components/ui/toaster', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { PreviewBanner } from '@/components/preview/preview-banner';

const KEY = 'preview.banner.dismissed';
const wrap = (ui: ReactNode) => (
  <QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>
);

beforeEach(() => {
  persistence.value = true;
  resetDemo.mockClear();
  goHome.mockClear();
  localStorage.clear();
});
afterEach(() => vi.restoreAllMocks());

describe('PreviewBanner', () => {
  it('shows the demo message with the persona name', () => {
    render(wrap(<PreviewBanner />));
    expect(screen.getByText(/preview\.bannerText/)).toHaveTextContent('Aria Wijaya');
    expect(screen.getByRole('button', { name: 'preview.resetDemo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'preview.dismiss' })).toBeInTheDocument();
  });

  it('dismiss hides it and persists in localStorage across a remount', async () => {
    const user = userEvent.setup();
    const { unmount } = render(wrap(<PreviewBanner />));
    await user.click(screen.getByRole('button', { name: 'preview.dismiss' }));
    expect(screen.queryByText(/preview\.bannerText/)).not.toBeInTheDocument();
    expect(localStorage.getItem(KEY)).toBe('1');
    unmount();

    render(wrap(<PreviewBanner />));
    expect(screen.queryByText(/preview\.bannerText/)).not.toBeInTheDocument();
  });

  it('still renders when localStorage throws on read and write', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const user = userEvent.setup();
    render(wrap(<PreviewBanner />));
    expect(screen.getByText(/preview\.bannerText/)).toBeInTheDocument();
    // dismissing still hides it for this page view even though it cannot be stored
    await user.click(screen.getByRole('button', { name: 'preview.dismiss' }));
    expect(screen.queryByText(/preview\.bannerText/)).not.toBeInTheDocument();
  });

  it('shows a non-dismissible warning when storage is unavailable, even if dismissed before', () => {
    persistence.value = false;
    localStorage.setItem(KEY, '1');
    render(wrap(<PreviewBanner />));
    expect(screen.getByText('preview.bannerNotPersistent')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'preview.dismiss' })).not.toBeInTheDocument();
    expect(screen.queryByText(/preview\.bannerText/)).not.toBeInTheDocument();
  });

  it('the reset link opens the confirm dialog; confirming resets once and reloads home', async () => {
    const user = userEvent.setup();
    render(wrap(<PreviewBanner />));
    await user.click(screen.getByRole('button', { name: 'preview.resetDemo' }));
    expect(screen.getByText('preview.resetConfirmBody')).toBeInTheDocument();
    expect(resetDemo).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'preview.resetConfirm' }));
    await vi.waitFor(() => expect(goHome).toHaveBeenCalledTimes(1), { timeout: 3000 });
    expect(resetDemo).toHaveBeenCalledTimes(1);
  });
});

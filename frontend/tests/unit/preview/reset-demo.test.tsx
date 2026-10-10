import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { MeResponse } from '@/lib/api/types';

const resetDemo = vi.fn(async () => {});
vi.mock('@/preview', () => ({ resetDemo: () => resetDemo() }));
const goHome = vi.fn();
vi.mock('@/preview/navigate', () => ({ goHomeWithReload: () => goHome() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock('@/components/ui/toaster', () => ({ toast }));

import { ResetPartialError } from '@/preview/reset-error';
import { ProfileMenu } from '@/components/navigation/profile-menu';

const me: MeResponse = {
  id: 'u1',
  email: 'aria@example.org',
  displayName: 'Aria Wijaya',
  locale: 'en',
  isAdmin: true,
  role: 'admin',
  avatar: { initials: 'AW', bgColor: 'brand-blue', fgColor: 'ink-white' },
  hasPublishedAssets: true,
  unreadNotifications: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
};

function setup(client = new QueryClient()) {
  const u = userEvent.setup();
  render(
    <QueryClientProvider client={client}>
      <ProfileMenu user={me} />
    </QueryClientProvider>,
  );
  return { u, client };
}

beforeEach(() => {
  resetDemo.mockReset().mockResolvedValue(undefined);
  goHome.mockClear();
  toast.success.mockClear();
  toast.error.mockClear();
  localStorage.clear();
});

describe('profile menu: Reset demo data', () => {
  it('replaces Sign out with Reset demo data', async () => {
    const { u } = setup();
    await u.click(screen.getByRole('button', { name: 'common.openProfileMenu' }));
    expect(screen.getByRole('button', { name: 'preview.resetDemo' })).toBeInTheDocument();
    expect(screen.queryByText('common.signOut')).not.toBeInTheDocument();
  });

  it('confirm: resets once, clears the query cache and the banner flag, then reloads', async () => {
    const client = new QueryClient();
    client.setQueryData(['x'], 1);
    localStorage.setItem('preview.banner.dismissed', '1');
    const { u } = setup(client);
    await u.click(screen.getByRole('button', { name: 'common.openProfileMenu' }));
    await u.click(screen.getByRole('button', { name: 'preview.resetDemo' }));
    expect(screen.getByText('preview.resetConfirmTitle')).toBeInTheDocument();
    expect(resetDemo).not.toHaveBeenCalled();

    await u.click(screen.getByRole('button', { name: 'preview.resetConfirm' }));
    await vi.waitFor(() => expect(goHome).toHaveBeenCalledTimes(1), { timeout: 3000 });
    expect(resetDemo).toHaveBeenCalledTimes(1);
    expect(client.getQueryData(['x'])).toBeUndefined();
    expect(localStorage.getItem('preview.banner.dismissed')).toBeNull();
    expect(toast.success).toHaveBeenCalledTimes(1);
  });

  it('cancel does nothing', async () => {
    const { u } = setup();
    await u.click(screen.getByRole('button', { name: 'common.openProfileMenu' }));
    await u.click(screen.getByRole('button', { name: 'preview.resetDemo' }));
    await u.click(screen.getByRole('button', { name: 'common.cancel' }));
    expect(resetDemo).not.toHaveBeenCalled();
    expect(goHome).not.toHaveBeenCalled();
    expect(screen.queryByText('preview.resetConfirmTitle')).not.toBeInTheDocument();
  });

  it('a failing reset shows an error, does not reload and keeps the dialog open', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    resetDemo.mockRejectedValueOnce(new Error('idb'));
    const { u } = setup();
    await u.click(screen.getByRole('button', { name: 'common.openProfileMenu' }));
    await u.click(screen.getByRole('button', { name: 'preview.resetDemo' }));
    await u.click(screen.getByRole('button', { name: 'preview.resetConfirm' }));
    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    expect(goHome).not.toHaveBeenCalled();
    expect(screen.getByText('preview.resetConfirmTitle')).toBeInTheDocument();
  });

  it('closes the profile popover when the confirm dialog opens', async () => {
    const { u } = setup();
    await u.click(screen.getByRole('button', { name: 'common.openProfileMenu' }));
    await u.click(screen.getByRole('button', { name: 'preview.resetDemo' }));
    expect(screen.getByText('preview.resetConfirmTitle')).toBeInTheDocument();
    // hidden: true also finds content Radix marks aria-hidden behind the modal
    expect(
      screen.queryByRole('button', { name: 'preview.resetDemo', hidden: true }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Aria Wijaya')).not.toBeInTheDocument();
  });

  it('a partial reset (files not removed) says so, but still refreshes the page', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    resetDemo.mockRejectedValueOnce(new ResetPartialError());
    const client = new QueryClient();
    client.setQueryData(['x'], 1);
    const { u } = setup(client);
    await u.click(screen.getByRole('button', { name: 'common.openProfileMenu' }));
    await u.click(screen.getByRole('button', { name: 'preview.resetDemo' }));
    await u.click(screen.getByRole('button', { name: 'preview.resetConfirm' }));
    await vi.waitFor(() => expect(goHome).toHaveBeenCalledTimes(1), { timeout: 5000 });
    expect(toast.error).toHaveBeenCalledWith('preview.resetPartial');
    expect(toast.success).not.toHaveBeenCalled();
    expect(client.getQueryData(['x'])).toBeUndefined();
  });
});

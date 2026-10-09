import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import type { MeResponse } from '@/lib/api/types';

const previewFetch = vi.fn();
vi.mock('@/preview', () => ({ previewFetch: (...args: unknown[]) => previewFetch(...args) }));

import { MeProvider, useMe, useSession } from '@/preview/session/me-provider';

const admin: MeResponse = {
  id: 'u-admin',
  email: 'demo@example.org',
  displayName: 'Demo Admin',
  locale: 'en',
  isAdmin: true,
  role: 'admin',
  avatar: { initials: 'DA', bgColor: 'brand-blue', fgColor: 'ink-white' },
  hasPublishedAssets: true,
  unreadNotifications: 3,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const wrapper = ({ children }: { children: ReactNode }) => <MeProvider>{children}</MeProvider>;

beforeEach(() => {
  previewFetch.mockReset();
});

describe('MeProvider', () => {
  it('renders children only after /auth/me resolves', async () => {
    let resolve!: (v: MeResponse) => void;
    previewFetch.mockReturnValue(new Promise<MeResponse>((r) => (resolve = r)));

    render(
      <MeProvider>
        <p>app content</p>
      </MeProvider>,
    );
    expect(screen.queryByText('app content')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();

    resolve(admin);
    expect(await screen.findByText('app content')).toBeInTheDocument();
    expect(previewFetch).toHaveBeenCalledWith('/auth/me', expect.anything());
  });

  it('useMe exposes the persona (admin)', async () => {
    previewFetch.mockResolvedValue(admin);
    const { result } = renderHook(() => useMe(), { wrapper });
    await waitFor(() => expect(result.current).toBeTruthy());
    expect(result.current.role).toBe('admin');
    expect(result.current.id).toBe('u-admin');
  });

  it('useMe throws outside the provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useMe())).toThrow(/MeProvider/);
    spy.mockRestore();
  });

  it('shows an error panel with Retry and recovers', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    previewFetch.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(admin);

    render(
      <MeProvider>
        <p>app content</p>
      </MeProvider>,
    );
    const retry = await screen.findByRole('button', { name: /retry/i });
    expect(screen.queryByText('app content')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();

    await userEvent.click(retry);
    expect(await screen.findByText('app content')).toBeInTheDocument();
    expect(previewFetch).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });

  it('useSession returns a drop-in authenticated session stub', async () => {
    previewFetch.mockResolvedValue(admin);
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current).toBeTruthy());
    expect(result.current.status).toBe('authenticated');
    expect(result.current.data.accessToken).toBe('preview');
    expect(result.current.data.user).toEqual(admin);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../helpers/render';

const fetchApi = vi.hoisted(() => vi.fn());
const warn = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api/client', () => ({ useAuthedFetch: () => fetchApi }));
vi.mock('@/lib/logger', () => ({
  logger: { warn, info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/preview/session/me-provider', () => ({
  useMe: () => ({
    id: 'me-1',
    isAdmin: false,
    role: 'contributor',
    displayName: 'Demo User',
    email: 'demo@example.org',
    avatar: { initials: 'DU', bgColor: 'brand-blue', fgColor: 'ink-white' },
    createdAt: '2026-01-02T00:00:00.000Z',
  }),
  signOut: vi.fn(),
}));
vi.mock('@/components/notifications/notification-inbox', () => ({
  NotificationInbox: ({
    initial,
    initialCursor,
  }: {
    initial: unknown[];
    initialCursor: string | null;
  }) => (
    <div data-testid="inbox">
      {initial.length}|{String(initialCursor)}
    </div>
  ),
}));
vi.mock('@/components/request/request-surface', () => ({
  RequestSurface: ({ me, initial }: { me: { id: string }; initial: unknown[] }) => (
    <div data-testid="requests">
      {me.id}|{initial.length}
    </div>
  ),
}));

import { ProfilePageClient } from '@/components/profile/profile-page-client';
import { ProfileSurface } from '@/components/profile/profile-surface';
import { NotificationsPageClient } from '@/components/notifications/notifications-page-client';
import { RequestPageClient } from '@/components/request/request-page-client';

const never = () => new Promise<never>(() => {});

beforeEach(() => {
  fetchApi.mockReset();
  warn.mockReset();
});

describe('ProfilePageClient', () => {
  it('shows a skeleton while pending, then the persona card and the fetched devices', async () => {
    fetchApi.mockResolvedValue([
      {
        id: 'd1',
        deviceLabel: 'Unity on laptop',
        createdAt: '2026-01-01T00:00:00.000Z',
        lastUsedAt: null,
        expiresAt: '2099-01-01T00:00:00.000Z',
      },
    ]);
    renderWithProviders(<ProfilePageClient />);
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    expect(await screen.findByText('Demo User')).toBeInTheDocument();
    expect(screen.getByText('demo@example.org')).toBeInTheDocument();
    expect(screen.getByText('Contributor')).toBeInTheDocument();
    expect(await screen.findByText('Unity on laptop')).toBeInTheDocument();
    expect(fetchApi).toHaveBeenCalledWith('/auth/plugin/devices');
  });

  it('treats a failed device list as non-fatal: empty state, failure logged', async () => {
    fetchApi.mockRejectedValue(new Error('boom'));
    renderWithProviders(<ProfilePageClient />);
    expect(await screen.findByText('No plugin devices yet.')).toBeInTheDocument();
    expect(warn).toHaveBeenCalledWith('profile.devices-failed', {
      path: '/auth/plugin/devices',
      err: 'boom',
    });
  });

  it('stays on the skeleton while the request is in flight', () => {
    fetchApi.mockImplementation(never);
    renderWithProviders(<ProfilePageClient />);
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    expect(screen.queryByText('Demo User')).not.toBeInTheDocument();
  });
});

describe('ProfileSurface account copy', () => {
  it('uses the localized preview wording, not the old Keycloak copy', () => {
    renderWithProviders(<ProfileSurface devices={[]} locale="en" />);
    expect(screen.getByText('profile.accountBody')).toBeInTheDocument();
    expect(screen.queryByText(/Keycloak/)).not.toBeInTheDocument();
  });
});

describe('NotificationsPageClient', () => {
  it('shows a skeleton, then hands the first page to the inbox', async () => {
    fetchApi.mockResolvedValue({
      items: [{ id: 'n1' }, { id: 'n2' }],
      pageInfo: { nextCursor: 'c2', hasMore: true },
    });
    renderWithProviders(<NotificationsPageClient />);
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    expect(await screen.findByTestId('inbox')).toHaveTextContent('2|c2');
    expect(screen.getByRole('heading', { name: 'notif.heading' })).toBeInTheDocument();
    expect(fetchApi).toHaveBeenCalledWith('/notifications', { query: { limit: 50 } });
  });

  it('falls back to an empty inbox when the first page fails', async () => {
    fetchApi.mockRejectedValue(new Error('down'));
    renderWithProviders(<NotificationsPageClient />);
    expect(await screen.findByTestId('inbox')).toHaveTextContent('0|null');
    expect(warn).toHaveBeenCalledWith('notifications.fetch-failed', {
      path: '/notifications',
      err: 'down',
    });
  });
});

describe('RequestPageClient', () => {
  it('shows a skeleton, then the surface with the current user and history', async () => {
    fetchApi.mockResolvedValue({
      items: [{ id: 'r1' }],
      pageInfo: { nextCursor: null, hasMore: false },
    });
    renderWithProviders(<RequestPageClient />);
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    expect(await screen.findByTestId('requests')).toHaveTextContent('me-1|1');
    expect(fetchApi).toHaveBeenCalledWith('/asset-requests', { query: { limit: 50 } });
  });

  it('renders the surface empty (not an error) when the history fails to load', async () => {
    fetchApi.mockRejectedValue(new Error('nope'));
    renderWithProviders(<RequestPageClient />);
    expect(await screen.findByTestId('requests')).toHaveTextContent('me-1|0');
    expect(warn).toHaveBeenCalledWith('request.fetch-failed', {
      path: '/asset-requests',
      err: 'nope',
    });
  });
});

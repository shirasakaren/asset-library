import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderRaw } from '../../helpers/render';

const meState = vi.hoisted(() => ({ id: 'u1', isAdmin: true }));

vi.mock('@/preview/session/me-provider', () => ({ useMe: () => meState }));
vi.mock('@/components/admin/admin-sidebar', () => ({
  AdminSidebar: () => <nav data-testid="admin-sidebar" />,
}));

import { AdminChrome, withAdminChrome } from '@/components/admin/admin-chrome';
import AdminLayout from '@/app/(app)/admin/layout';

beforeEach(() => {
  meState.isAdmin = true;
});

describe('AdminChrome', () => {
  it('renders the sidebar and the page for an admin', () => {
    renderRaw(
      <AdminChrome>
        <p>admin page</p>
      </AdminChrome>,
    );
    expect(screen.getByTestId('admin-sidebar')).toBeInTheDocument();
    expect(screen.getByText('admin page')).toBeInTheDocument();
    expect(screen.queryByText(/don't have access/)).not.toBeInTheDocument();
  });

  it('shows the 403 content (no sidebar, no page) for a non-admin', () => {
    meState.isAdmin = false;
    renderRaw(
      <AdminChrome>
        <p>admin page</p>
      </AdminChrome>,
    );
    expect(screen.getByText("You don't have access to that page.")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to Discover' })).toHaveAttribute('href', '/');
    expect(screen.queryByTestId('admin-sidebar')).not.toBeInTheDocument();
    expect(screen.queryByText('admin page')).not.toBeInTheDocument();
  });

  it('the admin layout wraps its children in the chrome', () => {
    renderRaw(
      <AdminLayout>
        <p>layout child</p>
      </AdminLayout>,
    );
    expect(screen.getByTestId('admin-sidebar')).toBeInTheDocument();
    expect(screen.getByText('layout child')).toBeInTheDocument();
  });

  it('withAdminChrome wraps a component and passes its props through', () => {
    const Page = ({ id }: { id: string }) => <p>page:{id}</p>;
    const Wrapped = withAdminChrome(Page);
    renderRaw(<Wrapped id="x1" />);
    expect(screen.getByTestId('admin-sidebar')).toBeInTheDocument();
    expect(screen.getByText('page:x1')).toBeInTheDocument();
  });

  it('withAdminChrome also gates the page for a non-admin', () => {
    meState.isAdmin = false;
    const Wrapped = withAdminChrome(() => <p>secret</p>);
    renderRaw(<Wrapped />);
    expect(screen.queryByText('secret')).not.toBeInTheDocument();
    expect(screen.getByText("You don't have access to that page.")).toBeInTheDocument();
  });
});

'use client';

import { Suspense, type ComponentType, type ReactNode } from 'react';
import { AdminListSkeleton } from '@/components/admin/admin-list-skeleton';
import { AdminSidebar } from '@/components/admin/admin-sidebar';
import { Container } from '@/components/layout/container';
import { ForbiddenContent } from '@/components/layout/forbidden-content';
import { useMe } from '@/preview/session/me-provider';

/**
 * Admin page chrome (sidebar + content column) and the admin gate. Used by
 * `(app)/admin/layout.tsx` and, through `withAdminChrome`, by the exported
 * `not-found` shell, which renders runtime-created admin routes outside the
 * admin layout. Non-admins get the 403 content instead of the admin UI.
 *
 * The Suspense boundary covers admin pages that read the URL with `useSearchParams()`.
 */
export function AdminChrome({ children }: { children: ReactNode }) {
  const me = useMe();
  if (!me.isAdmin) return <ForbiddenContent />;
  return (
    <Container size="2xl">
      <div className="grid grid-cols-1 gap-8 pb-20 pt-6 lg:grid-cols-[220px_1fr]">
        <AdminSidebar />
        <div className="min-w-0">
          <Suspense fallback={<AdminListSkeleton />}>{children}</Suspense>
        </div>
      </div>
    </Container>
  );
}

/** Wraps a page component in `AdminChrome` (for registry entries that live outside the admin layout). */
export function withAdminChrome<P extends object>(Page: ComponentType<P>): ComponentType<P> {
  return function AdminChromePage(props: P) {
    return (
      <AdminChrome>
        <Page {...props} />
      </AdminChrome>
    );
  };
}

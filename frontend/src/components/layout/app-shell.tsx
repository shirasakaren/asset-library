'use client';

import type { ReactNode } from 'react';
import { Navbar } from '@/components/layout/navbar';
import { Footer } from '@/components/layout/footer';
import { WsBootstrap } from '@/components/navigation/ws-bootstrap';
import { NotificationsLive } from '@/components/notifications/notification-live';
import { UploadDock } from '@/components/upload/upload-dock';
import { useMe } from '@/preview/session/me-provider';

/**
 * Chrome shared by every signed-in page. Used by `(app)/layout.tsx` and by the
 * exported `not-found` shell, which renders user-created dynamic routes
 * outside the `(app)` layout tree and so has to supply the chrome itself.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const me = useMe();
  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <Navbar user={me} />
      <main className="flex-1">{children}</main>
      <Footer />
      <WsBootstrap />
      <NotificationsLive />
      <UploadDock />
    </div>
  );
}

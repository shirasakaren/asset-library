import type { ReactNode } from 'react';
import { Navbar } from '@/components/layout/navbar';
import { Footer } from '@/components/layout/footer';
import { WsBootstrap } from '@/components/navigation/ws-bootstrap';
import { NotificationsLive } from '@/components/notifications/notification-live';
import { UploadDock } from '@/components/upload/upload-dock';
import { requireSession, fetchMe } from '@/lib/auth/server';

export default async function AppLayout({ children }: { children: ReactNode }) {
  // TEMPORARY: server-side session shim; this layout becomes a client layout in Task 5.
  const session = await requireSession();
  const me = await fetchMe(session);

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

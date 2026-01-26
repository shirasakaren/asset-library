import type { ReactNode } from 'react';
import { Navbar } from '@/components/layout/navbar';
import { Footer } from '@/components/layout/footer';
import { WsBootstrap } from '@/components/navigation/ws-bootstrap';
import { NotificationsLive } from '@/components/notifications/notification-live';
import { UploadDock } from '@/components/upload/upload-dock';
import { requireSession, fetchMe } from '@/lib/auth/server';

export default async function AppLayout({ children }: { children: ReactNode }) {
  // Middleware already short-circuits unauthenticated requests to /auth/signin
  // with a real callbackUrl. requireSession here is a belt-and-suspenders
  // guarantee for any RSC-only render path.
  const session = await requireSession();
  const me = await fetchMe(session);

  return (
    <div className="min-h-dvh flex flex-col bg-bg">
      <Navbar user={me} />
      <main className="flex-1">{children}</main>
      <Footer />
      <WsBootstrap token={session.accessToken ?? null} />
      <NotificationsLive />
      <UploadDock />
    </div>
  );
}

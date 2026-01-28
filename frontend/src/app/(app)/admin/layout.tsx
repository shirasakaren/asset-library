import type { ReactNode } from 'react';
import { Container } from '@/components/layout/container';
import { AdminSidebar } from '@/components/admin/admin-sidebar';
import { requireAdmin } from '@/lib/auth/server';

export const metadata = { title: 'Admin' };
export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAdmin();
  return (
    <Container size="2xl">
      <div className="pt-6 pb-20 grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-8">
        <AdminSidebar />
        <div className="min-w-0">{children}</div>
      </div>
    </Container>
  );
}

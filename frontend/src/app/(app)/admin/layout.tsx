import type { ReactNode } from 'react';
import { AdminChrome } from '@/components/admin/admin-chrome';

export const metadata = { title: 'Admin' };

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminChrome>{children}</AdminChrome>;
}

import seed from '@/preview/seed-data/users.json';
import { AdminUserPageClient } from '@/components/admin/user-detail-page-client';
import { seededIdParams } from '@/lib/static-params';

interface PageProps {
  params: Promise<{ id: string }>;
}

export const metadata = { title: 'User · Admin' };

/**
 * Pre-render every seeded record. Ids created at runtime are rendered by the exported
 * `not-found` shell (see `src/preview/router/dynamic-pages.tsx`).
 */
export function generateStaticParams() {
  return seededIdParams(seed as Array<{ id: string }>);
}

export default async function AdminUserPage({ params }: PageProps) {
  const { id } = await params;
  return <AdminUserPageClient id={id} />;
}

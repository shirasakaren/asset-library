import seed from '@/preview/seed-data/requests.json';
import { AdminRequestPageClient } from '@/components/admin/request-detail-page-client';
import { seededIdParams } from '@/lib/static-params';

interface PageProps {
  params: Promise<{ id: string }>;
}

export const metadata = { title: 'Request · Admin' };

/**
 * Pre-render every seeded record. Ids created at runtime are rendered by the exported
 * `not-found` shell (see `src/preview/router/dynamic-pages.tsx`).
 */
export function generateStaticParams() {
  return seededIdParams(seed as Array<{ id: string }>);
}

export default async function AdminRequestDetailPage({ params }: PageProps) {
  const { id } = await params;
  return <AdminRequestPageClient id={id} />;
}

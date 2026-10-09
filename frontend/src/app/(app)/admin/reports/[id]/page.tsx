import seed from '@/preview/seed-data/reports.json';
import { AdminReportPageClient } from '@/components/admin/report-detail-page-client';
import { seededIdParams } from '@/lib/static-params';

interface PageProps {
  params: Promise<{ id: string }>;
}

export const metadata = { title: 'Report · Admin' };

/**
 * Pre-render every seeded record. Ids created at runtime are rendered by the exported
 * `not-found` shell (see `src/preview/router/dynamic-pages.tsx`).
 */
export function generateStaticParams() {
  return seededIdParams(seed as Array<{ id: string }>);
}

export default async function AdminReportDetailPage({ params }: PageProps) {
  const { id } = await params;
  return <AdminReportPageClient id={id} />;
}

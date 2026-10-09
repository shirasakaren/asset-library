import seed from '@/preview/seed-data/assets.json';
import { AdminAssetEditPageClient } from '@/components/admin/asset-edit-page-client';
import { seededIdParams } from '@/lib/static-params';

interface PageProps {
  params: Promise<{ id: string }>;
}

export const metadata = { title: 'Edit on behalf · Admin' };

/**
 * Pre-render every seeded record. Ids created at runtime are rendered by the exported
 * `not-found` shell (see `src/preview/router/dynamic-pages.tsx`).
 */
export function generateStaticParams() {
  return seededIdParams(seed as Array<{ id: string }>);
}

export default async function AdminEditOnBehalfPage({ params }: PageProps) {
  const { id } = await params;
  return <AdminAssetEditPageClient id={id} />;
}

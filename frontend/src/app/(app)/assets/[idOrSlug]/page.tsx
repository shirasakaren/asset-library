import seed from '@/preview/seed-data/assets.json';
import { AssetDetailPageClient } from '@/components/asset/asset-detail-page-client';

interface PageProps {
  params: Promise<{ idOrSlug: string }>;
}

/**
 * Pre-render every seeded asset. Slugs created at runtime are rendered by the
 * exported `not-found` shell (see `src/preview/router/dynamic-pages.tsx`).
 */
export function generateStaticParams() {
  const assets = seed as Array<{ id: string; slug?: string }>;
  const params = assets.map((a) => ({ idOrSlug: a.slug ?? a.id }));
  // An empty list would fail the export build ("missing generateStaticParams").
  return params.length > 0 ? params : [{ idOrSlug: '_placeholder' }];
}

export default async function AssetDetailPage({ params }: PageProps) {
  const { idOrSlug } = await params;
  return <AssetDetailPageClient idOrSlug={idOrSlug} />;
}

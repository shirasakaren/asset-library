import seed from '@/preview/seed-data/assets.json';
import { AnalyticsPageClient } from '@/components/publish/analytics-page-client';
import { seededIdParams } from '@/lib/static-params';

interface PageProps {
  params: Promise<{ id: string }>;
}

export function generateStaticParams() {
  return seededIdParams(seed as Array<{ id: string }>);
}

export default async function AnalyticsPage({ params }: PageProps) {
  const { id } = await params;
  return <AnalyticsPageClient id={id} />;
}

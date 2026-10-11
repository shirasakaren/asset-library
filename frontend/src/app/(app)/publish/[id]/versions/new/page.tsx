import seed from '@/preview/seed-data/assets.json';
import { NewVersionPageClient } from '@/components/publish/new-version-page-client';
import { seededIdParams } from '@/lib/static-params';

interface PageProps {
  params: Promise<{ id: string }>;
}

export function generateStaticParams() {
  return seededIdParams(seed as Array<{ id: string }>);
}

export default async function NewVersionPage({ params }: PageProps) {
  const { id } = await params;
  return <NewVersionPageClient id={id} />;
}

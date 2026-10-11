import seed from '@/preview/seed-data/assets.json';
import { PublishWizardPageClient } from '@/components/publish/publish-wizard-page-client';
import { seededIdParams } from '@/lib/static-params';

interface PageProps {
  params: Promise<{ id: string }>;
}

export const metadata = { title: 'Publish' };

/**
 * Pre-render the wizard for every seeded asset. Ids created at runtime are rendered by
 * the exported `not-found` shell (see `src/preview/router/dynamic-pages.tsx`).
 */
export function generateStaticParams() {
  return seededIdParams(seed as Array<{ id: string }>);
}

export default async function PublishWizardPage({ params }: PageProps) {
  const { id } = await params;
  return <PublishWizardPageClient id={id} />;
}

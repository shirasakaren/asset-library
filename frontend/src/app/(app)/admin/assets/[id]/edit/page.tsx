import { notFound } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { Alert } from '@/components/ui/alert';
import { Container } from '@/components/layout/container';
import { PublishWizard } from '@/components/publish/wizard';
import { requireSession, requireAdmin } from '@/lib/auth/server';
import { apiFetch } from '@/lib/api/fetcher';
import { ApiError } from '@/lib/api/errors';
import type { AssetDetail, LocaleCode } from '@/lib/api/types';

interface PageProps {
  params: Promise<{ id: string }>;
}

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Edit on behalf · Admin' };

export default async function AdminEditOnBehalfPage({ params }: PageProps) {
  const { id } = await params;
  const me = await requireAdmin();
  const session = await requireSession();
  const locale = (await getLocale()) as LocaleCode;
  let asset: AssetDetail;
  try {
    asset = await apiFetch<AssetDetail>(`/assets/${encodeURIComponent(id)}`, {
      accessToken: session.accessToken,
      locale,
      query: { locale, includeUnpublished: 'true' },
      cache: 'no-store',
    });
  } catch (err) {
    if (ApiError.isApiError(err) && err.status === 404) notFound();
    throw err;
  }

  return (
    <Container size="2xl" className="!px-0">
      <Alert variant="warning" className="mx-6 mt-2" title={`Editing on behalf of ${asset.owner.displayName}`}>
        You're signed in as {me.displayName}. Every save is audit-logged.
      </Alert>
      <PublishWizard initialAsset={asset} />
    </Container>
  );
}

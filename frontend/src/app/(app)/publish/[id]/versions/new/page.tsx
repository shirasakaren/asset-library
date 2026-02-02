import { notFound } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { requireSession, fetchMe } from '@/lib/auth/server';
import { apiFetch } from '@/lib/api/fetcher';
import { ApiError } from '@/lib/api/errors';
import { NewVersionForm } from '@/components/publish/new-version-form';
import type { AssetDetail, LocaleCode } from '@/lib/api/types';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function NewVersionPage({ params }: PageProps) {
  const { id } = await params;
  const session = await requireSession();
  const me = await fetchMe(session);
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

  if (asset.owner.id !== me.id && !me.isAdmin) notFound();

  return <NewVersionForm asset={asset} />;
}

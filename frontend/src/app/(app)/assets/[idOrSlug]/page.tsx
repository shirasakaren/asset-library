import { notFound } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { requireSession, fetchMe } from '@/lib/auth/server';
import { apiFetch } from '@/lib/api/fetcher';
import { ApiError } from '@/lib/api/errors';
import type { AssetDetail, LocaleCode } from '@/lib/api/types';
import { AssetDetailShell } from '@/components/asset/asset-detail-shell';

interface PageProps {
  params: Promise<{ idOrSlug: string }>;
}

export const revalidate = 60;

export async function generateMetadata({ params }: PageProps) {
  const { idOrSlug } = await params;
  return { title: `${idOrSlug.replace(/-/g, ' ')}` };
}

export default async function AssetDetailPage({ params }: PageProps) {
  const { idOrSlug } = await params;
  const session = await requireSession();
  const locale = (await getLocale()) as LocaleCode;
  const me = await fetchMe(session);

  let asset: AssetDetail;
  try {
    asset = await apiFetch<AssetDetail>(`/assets/${encodeURIComponent(idOrSlug)}`, {
      accessToken: session.accessToken,
      locale,
      query: { locale },
      cache: 'no-store',
    });
  } catch (err) {
    if (ApiError.isApiError(err) && err.status === 404) notFound();
    throw err;
  }

  // The asset detail carries its own isSaved flag; the recommendations module
  // hydrates its card heart state client-side via useSavedIds().
  return (
    <AssetDetailShell asset={asset} currentUserId={me.id} isAdmin={me.isAdmin} me={me} />
  );
}

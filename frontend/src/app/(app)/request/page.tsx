import { getLocale } from 'next-intl/server';
import { Container } from '@/components/layout/container';
import { RequestSurface } from '@/components/request/request-surface';
import { requireSession, fetchMe } from '@/lib/auth/server';
import { apiFetch } from '@/lib/api/fetcher';
import type { AssetRequestListPage, LocaleCode } from '@/lib/api/types';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Request' };

export default async function RequestPage() {
  const session = await requireSession();
  const me = await fetchMe(session);
  const locale = (await getLocale()) as LocaleCode;
  let initial: AssetRequestListPage = { items: [], pageInfo: { nextCursor: null, hasMore: false } };
  try {
    initial = await apiFetch<AssetRequestListPage>('/asset-requests', {
      accessToken: session.accessToken,
      locale,
      query: { limit: 50 },
      cache: 'no-store',
    });
  } catch {
    /* non-fatal */
  }

  return (
    <Container size="2xl">
      <div className="pt-6 pb-20">
        <RequestSurface me={me} initial={initial.items} />
      </div>
    </Container>
  );
}

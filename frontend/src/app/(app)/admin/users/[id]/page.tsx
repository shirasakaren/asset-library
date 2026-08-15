import { notFound } from 'next/navigation';
import NextLink from 'next/link';
import { getLocale } from 'next-intl/server';
import { ArrowLeft } from 'lucide-react';
import { AdminPageHeader } from '@/components/admin/admin-page-header';
import { Card } from '@/components/ui/card';
import { Avatar } from '@/components/ui/avatar';
import { avatarFromServer, getAvatarTokens } from '@/lib/avatar';
import { requireSession } from '@/lib/auth/server';
import { apiFetch } from '@/lib/api/fetcher';
import { ApiError } from '@/lib/api/errors';
import { formatDate, formatNumber } from '@/lib/format';
import type { LocaleCode, ServerAvatar } from '@/lib/api/types';

interface UserPublicProfile {
  id: string;
  displayName: string;
  avatar?: ServerAvatar;
  joinedAt: string;
  publishedAssetCount: number;
  email: string | null;
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export const dynamic = 'force-dynamic';

export default async function AdminUserPage({ params }: PageProps) {
  const { id } = await params;
  const session = await requireSession();
  const locale = (await getLocale()) as LocaleCode;
  let user: UserPublicProfile;
  try {
    user = await apiFetch<UserPublicProfile>(`/users/${id}`, {
      accessToken: session.accessToken,
      cache: 'no-store',
    });
  } catch (err) {
    if (ApiError.isApiError(err) && err.status === 404) notFound();
    throw err;
  }

  const avatar = user.avatar
    ? avatarFromServer(user.avatar)
    : getAvatarTokens({ id: user.id, displayName: user.displayName, email: user.email ?? '' });

  return (
    <>
      <AdminPageHeader
        title={user.displayName}
        description={
          user.email ? (
            <code className="font-mono text-[12.5px] text-ink-3">{user.email}</code>
          ) : null
        }
        actions={
          <NextLink href="/admin/users" className="inline-flex items-center gap-1 text-caption text-brand-blue hover:underline">
            <ArrowLeft className="h-3 w-3" strokeWidth={2.25} />
            Back to users
          </NextLink>
        }
      />
      <div className="grid lg:grid-cols-[1fr_2fr] gap-6">
        <Card padding="lg" className="flex items-center gap-4">
          <Avatar data={avatar} size={64} />
          <div>
            <p className="font-display text-h2 text-ink tracking-[-0.01em]">{user.displayName}</p>
            <p className="text-caption text-ink-3 mt-1 geist-tnum">
              Joined {formatDate(user.joinedAt, locale, { dateStyle: 'long' })}
            </p>
            <p className="text-caption text-ink-3 mt-1 geist-tnum">
              {formatNumber(user.publishedAssetCount, locale)} published assets
            </p>
          </div>
        </Card>
        <Card padding="lg">
          <p className="text-eyebrow uppercase tracking-[0.12em] text-ink-3 mb-3">Quick links</p>
          <ul className="space-y-2 text-[13.5px]">
            <li>
              <NextLink className="link-inline" href={`/admin/assets?ownerId=${user.id}`}>
                Assets owned by this user
              </NextLink>
            </li>
            <li>
              <NextLink className="link-inline" href={`/admin/audit?actorId=${user.id}`}>
                Audit log entries by this user (as actor)
              </NextLink>
            </li>
            <li>
              <NextLink className="link-inline" href={`/admin/audit?subjectId=${user.id}`}>
                Audit log entries about this user (as subject)
              </NextLink>
            </li>
          </ul>
        </Card>
      </div>
    </>
  );
}

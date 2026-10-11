'use client';

import NextLink from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useLocale } from 'next-intl';
import { ArrowLeft } from 'lucide-react';
import { AdminPageHeader } from '@/components/admin/admin-page-header';
import { AdminQueryState } from '@/components/admin/admin-query-state';
import { Card } from '@/components/ui/card';
import { Avatar } from '@/components/ui/avatar';
import { avatarFromServer, getAvatarTokens } from '@/lib/avatar';
import { useAuthedFetch } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/queries';
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

/** Body of `/admin/users/[id]` (the admin layout / `withAdminChrome` supplies the chrome). */
export function AdminUserPageClient({ id }: { id: string }) {
  const locale = useLocale() as LocaleCode;
  const fetchApi = useAuthedFetch();
  const q = useQuery({
    queryKey: queryKeys.adminUser(id),
    queryFn: () => fetchApi<UserPublicProfile>(`/users/${encodeURIComponent(id)}`),
  });

  return (
    <AdminQueryState query={q}>
      {(user) => {
        const avatar = user.avatar
          ? avatarFromServer(user.avatar)
          : getAvatarTokens({
              id: user.id,
              displayName: user.displayName,
              email: user.email ?? '',
            });
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
                <NextLink
                  href="/admin/users"
                  className="inline-flex items-center gap-1 text-caption text-brand-blue hover:underline"
                >
                  <ArrowLeft className="h-3 w-3" strokeWidth={2.25} />
                  Back to users
                </NextLink>
              }
            />
            <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
              <Card padding="lg" className="flex items-center gap-4">
                <Avatar data={avatar} size={64} />
                <div>
                  <p className="font-display text-h2 tracking-[-0.01em] text-ink">
                    {user.displayName}
                  </p>
                  <p className="geist-tnum mt-1 text-caption text-ink-3">
                    Joined {formatDate(user.joinedAt, locale, { dateStyle: 'long' })}
                  </p>
                  <p className="geist-tnum mt-1 text-caption text-ink-3">
                    {formatNumber(user.publishedAssetCount, locale)} published assets
                  </p>
                </div>
              </Card>
              <Card padding="lg">
                <p className="mb-3 text-eyebrow uppercase tracking-[0.12em] text-ink-3">
                  Quick links
                </p>
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
      }}
    </AdminQueryState>
  );
}

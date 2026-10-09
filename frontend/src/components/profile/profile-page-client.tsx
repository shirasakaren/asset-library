'use client';

import { useQuery } from '@tanstack/react-query';
import { useLocale } from 'next-intl';
import { Container } from '@/components/layout/container';
import { PageSkeleton } from '@/components/layout/page-skeleton';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { ProfileSurface, type PluginDevice } from '@/components/profile/profile-surface';
import { useAuthedFetch } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/queries';
import type { LocaleCode } from '@/lib/api/types';
import { avatarFromServer } from '@/lib/avatar';
import { formatDate } from '@/lib/format';
import { useLogQueryError } from '@/lib/hooks/use-log-query-error';
import { useMe } from '@/preview/session/me-provider';

export function ProfilePageClient() {
  const me = useMe();
  const locale = useLocale() as LocaleCode;
  const fetchApi = useAuthedFetch();
  const devicesQ = useQuery({
    queryKey: queryKeys.myDevices,
    queryFn: () => fetchApi<PluginDevice[]>('/auth/plugin/devices'),
  });
  // A failed device list is non-fatal: the page shows the empty state.
  useLogQueryError('profile.devices-failed', '/auth/plugin/devices', devicesQ.error);

  if (devicesQ.isPending) return <PageSkeleton rows={2} />;

  const roleLabel =
    me.role === 'admin' ? 'Admin' : me.role === 'contributor' ? 'Contributor' : 'User';
  const roleVariant: 'info' | 'success' | 'neutral' =
    me.role === 'admin' ? 'info' : me.role === 'contributor' ? 'success' : 'neutral';

  return (
    <Container size="lg">
      <div className="pb-20 pt-8">
        <Card padding="lg" className="flex items-center gap-5">
          <Avatar data={avatarFromServer(me.avatar)} size={64} />
          <div className="min-w-0">
            <div className="mb-1 inline-flex items-center gap-2">
              <h1 className="font-display text-display-lg tracking-[-0.02em] text-ink">
                {me.displayName}
              </h1>
              <Badge variant={roleVariant}>{roleLabel}</Badge>
            </div>
            <p className="font-mono text-body text-ink-2">{me.email}</p>
            <p className="geist-tnum mt-1 text-caption text-ink-3">
              Joined {formatDate(me.createdAt, locale, { dateStyle: 'long' })}
            </p>
          </div>
        </Card>

        <ProfileSurface devices={devicesQ.data ?? []} locale={locale} />
      </div>
    </Container>
  );
}

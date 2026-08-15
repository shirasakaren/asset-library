import { getLocale } from 'next-intl/server';
import { Container } from '@/components/layout/container';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { ProfileSurface } from '@/components/profile/profile-surface';
import { avatarFromServer } from '@/lib/avatar';
import { requireSession, fetchMe } from '@/lib/auth/server';
import { apiFetch } from '@/lib/api/fetcher';
import { formatDate } from '@/lib/format';
import type { LocaleCode } from '@/lib/api/types';

export const metadata = { title: 'Profile' };
export const dynamic = 'force-dynamic';

interface PluginDevice {
  id: string;
  deviceLabel: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string;
}

export default async function ProfilePage() {
  const session = await requireSession();
  const me = await fetchMe(session);
  const locale = (await getLocale()) as LocaleCode;

  let devices: PluginDevice[] = [];
  try {
    devices = await apiFetch<PluginDevice[]>('/auth/plugin/devices', {
      accessToken: session.accessToken,
      cache: 'no-store',
    });
  } catch {
    /* non-fatal */
  }

  const roleLabel =
    me.role === 'admin' ? 'Admin' : me.role === 'contributor' ? 'Contributor' : 'User';
  const roleVariant: 'info' | 'success' | 'neutral' =
    me.role === 'admin' ? 'info' : me.role === 'contributor' ? 'success' : 'neutral';

  return (
    <Container size="lg">
      <div className="pt-8 pb-20">
        <Card padding="lg" className="flex items-center gap-5">
          <Avatar data={avatarFromServer(me.avatar)} size={64} />
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 mb-1">
              <h1 className="font-display text-display-lg text-ink tracking-[-0.02em]">
                {me.displayName}
              </h1>
              <Badge variant={roleVariant}>{roleLabel}</Badge>
            </div>
            <p className="text-body text-ink-2 font-mono">{me.email}</p>
            <p className="text-caption text-ink-3 mt-1 geist-tnum">
              Joined {formatDate(me.createdAt, locale, { dateStyle: 'long' })}
            </p>
          </div>
        </Card>

        <ProfileSurface devices={devices} locale={locale} />
      </div>
    </Container>
  );
}

'use client';

import { useTranslations } from 'next-intl';
import { LogOut } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { avatarFromServer } from '@/lib/avatar';
import type { MeResponse } from '@/lib/api/types';
import { cn } from '@/lib/utils';
import { signOut } from '@/preview/session/me-provider';

interface ProfileMenuProps {
  user: MeResponse;
}

export function ProfileMenu({ user }: ProfileMenuProps) {
  const tc = useTranslations('common');
  const tp = useTranslations('profileMenu');
  const tokens = avatarFromServer(user.avatar);
  const roleLabel =
    user.role === 'admin'
      ? tp('roleAdmin')
      : user.role === 'contributor'
        ? tp('roleContributor')
        : tp('roleUser');

  const roleVariant: 'info' | 'success' | 'neutral' =
    user.role === 'admin' ? 'info' : user.role === 'contributor' ? 'success' : 'neutral';

  const handleSignOut = async () => {
    await signOut({ callbackUrl: '/about' });
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={tc('openProfileMenu')}
          className={cn(
            'inline-flex h-10 w-10 items-center justify-center rounded-full',
            'transition-transform duration-200 hover:scale-[1.04]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2',
          )}
        >
          <Avatar data={tokens} size={32} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[260px] overflow-hidden p-0">
        <div className="flex items-start gap-3 border-b border-line px-4 pb-3 pt-4">
          <Avatar data={tokens} size={36} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13.5px] font-semibold text-ink">{user.displayName}</div>
            <div className="truncate text-[12px] text-ink-3" title={user.email}>
              {user.email}
            </div>
            <div className="mt-1.5">
              <Badge variant={roleVariant} size="sm">
                {roleLabel}
              </Badge>
            </div>
          </div>
        </div>
        <div className="p-1.5">
          <button
            type="button"
            onClick={handleSignOut}
            className="flex h-9 w-full items-center gap-2.5 rounded-[8px] px-2.5 text-[13.5px] text-ink transition-colors hover:bg-surface-muted focus-visible:bg-surface-muted focus-visible:outline-none"
          >
            <LogOut className="h-4 w-4 text-ink-3" strokeWidth={2.25} />
            {tc('signOut')}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

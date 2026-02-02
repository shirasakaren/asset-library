'use client';

import { useTranslations } from 'next-intl';
import { LogOut } from 'lucide-react';
import { signOut } from 'next-auth/react';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { avatarFromServer } from '@/lib/avatar';
import type { MeResponse } from '@/lib/api/types';
import { cn } from '@/lib/utils';
import { broadcast } from '@/lib/ws/broadcast';

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
    broadcast({ type: 'auth:sign-out' });
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

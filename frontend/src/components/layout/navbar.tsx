'use client';

import { useTranslations } from 'next-intl';
import NextLink from 'next/link';
import { Logo } from '@/components/brand/logo';
import { Container } from './container';
import { NavLink } from '@/components/navigation/nav-link';
import { CommunityDropdown } from '@/components/navigation/community-dropdown';
import { SearchBar } from '@/components/navigation/search-bar';
import { LocaleSwitcher } from '@/components/navigation/locale-switcher';
import { NotificationBell } from '@/components/navigation/notification-bell';
import { ProfileMenu } from '@/components/navigation/profile-menu';
import { AdminModePill } from '@/components/admin/admin-mode-pill';
import { ScrollAwareShell } from './scroll-aware-shell';
import type { MeResponse } from '@/lib/api/types';

interface NavbarProps {
  user: MeResponse;
}

export function Navbar({ user }: NavbarProps) {
  const t = useTranslations('nav');

  const links = [
    { href: '/', label: t('discover'), exact: true },
    { href: '/library', label: t('myLibrary') },
    { href: '/request', label: t('request') },
    { href: '/publish', label: t('publish') },
  ];

  return (
    <ScrollAwareShell
      className="bg-bg/70 border-b border-transparent backdrop-blur-[6px]"
      scrolledClassName="bg-bg/85 backdrop-blur-[8px] border-b border-line"
    >
      <Container size="2xl">
        <div className="flex h-16 items-center gap-4">
          {/* Left: brand + primary nav */}
          <div className="flex min-w-0 items-center gap-7">
            <Logo size="sm" href="/" priority />
            <nav aria-label="Primary" className="hidden items-center gap-5 md:flex">
              {links.map((l) => (
                <NavLink key={l.href} href={l.href} exact={l.exact}>
                  {l.label}
                </NavLink>
              ))}
              <CommunityDropdown />
              <NavLink href="/about">{t('about')}</NavLink>
            </nav>
          </div>

          {/* Right: utilities */}
          <div className="ml-auto flex items-center gap-1">
            <SearchBar />
            <div className="mx-1 hidden h-6 w-px bg-line md:block" aria-hidden />
            <LocaleSwitcher />
            <NotificationBell initialUnreadCount={user.unreadNotifications} />
            <AdminModePill isAdmin={user.isAdmin} />
            <div className="ml-1">
              <ProfileMenu user={user} />
            </div>
          </div>
        </div>
      </Container>
    </ScrollAwareShell>
  );
}

/** Stripped navbar used on the marketing /about route; its CTA opens the demo app. */
export function MarketingNavbar() {
  const t = useTranslations('common');
  return (
    <ScrollAwareShell
      className="bg-bg/70 border-b border-transparent backdrop-blur-[6px]"
      scrolledClassName="bg-bg/85 backdrop-blur-[8px] border-b border-line"
    >
      <Container size="2xl">
        <div className="flex h-16 items-center justify-between">
          <Logo size="sm" href="/about" priority />
          <NextLink
            href="/"
            className="inline-flex h-10 items-center justify-center rounded-[12px] bg-ink px-4 text-[14px] font-medium text-white transition-colors hover:bg-[#1a1f29]"
          >
            {t('openPreview')}
          </NextLink>
        </div>
      </Container>
    </ScrollAwareShell>
  );
}

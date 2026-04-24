import { getTranslations } from 'next-intl/server';
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

export async function Navbar({ user }: NavbarProps) {
  const t = await getTranslations('nav');

  const links = [
    { href: '/', label: t('discover'), exact: true },
    { href: '/library', label: t('myLibrary') },
    { href: '/request', label: t('request') },
    { href: '/publish', label: t('publish') },
  ];

  return (
    <ScrollAwareShell
      className="bg-bg/70 backdrop-blur-[6px] border-b border-transparent"
      scrolledClassName="bg-bg/85 backdrop-blur-[8px] border-b border-line"
    >
      <Container size="2xl">
        <div className="flex items-center gap-4 h-16">
          {/* Left: brand + primary nav */}
          <div className="flex items-center gap-7 min-w-0">
            <Logo size="sm" href="/" priority />
            <nav aria-label="Primary" className="hidden md:flex items-center gap-5">
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
            <div className="hidden md:block mx-1 h-6 w-px bg-line" aria-hidden />
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

/** Stripped navbar used on the marketing /about route. */
export async function MarketingNavbar() {
  const tc = await getTranslations('common');
  return (
    <ScrollAwareShell
      className="bg-bg/70 backdrop-blur-[6px] border-b border-transparent"
      scrolledClassName="bg-bg/85 backdrop-blur-[8px] border-b border-line"
    >
      <Container size="2xl">
        <div className="flex items-center justify-between h-16">
          <Logo size="sm" href="/about" priority />
          <a
            href="/auth/signin"
            className="inline-flex h-10 items-center justify-center px-4 rounded-[12px] bg-ink text-white text-[14px] font-medium hover:bg-[#1a1f29] transition-colors"
          >
            {tc('signIn')}
          </a>
        </div>
      </Container>
    </ScrollAwareShell>
  );
}

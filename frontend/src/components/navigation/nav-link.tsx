'use client';

import NextLink from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface NavLinkProps {
  href: string;
  children: ReactNode;
  exact?: boolean;
}

export function NavLink({ href, children, exact = false }: NavLinkProps) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <NextLink
      href={href}
      className={cn(
        'relative inline-flex items-center h-10 px-1 text-[14px] font-medium text-ink-2 hover:text-ink transition-colors duration-120',
        'after:absolute after:bottom-3 after:left-0 after:right-0 after:h-[2px] after:rounded-full after:bg-transparent after:transition-colors after:duration-120',
        active && 'text-ink after:bg-brand-blue',
      )}
    >
      {children}
    </NextLink>
  );
}

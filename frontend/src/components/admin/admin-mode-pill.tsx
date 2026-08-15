'use client';

import { ShieldCheck } from 'lucide-react';
import { usePathname } from 'next/navigation';
import NextLink from 'next/link';
import { cn } from '@/lib/utils';

/**
 * Tiny "Admin mode" pill that sticks to the navbar's right side whenever
 * the user is inside `/admin`. Helps avoid mode-confusion accidents.
 */
export function AdminModePill({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname() ?? '';
  if (!isAdmin) return null;
  const inAdmin = pathname.startsWith('/admin');
  return (
    <NextLink
      href={inAdmin ? '/' : '/admin'}
      className={cn(
        'hidden md:inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[11px] font-semibold border transition-colors duration-120',
        inAdmin
          ? 'bg-ink text-white border-ink hover:bg-[#1a1f29]'
          : 'bg-brand-blue-50 text-brand-blue border-brand-blue/20 hover:bg-brand-blue-50/80',
      )}
      title={inAdmin ? 'Leave admin' : 'Open admin'}
    >
      <ShieldCheck className="h-3 w-3" strokeWidth={2.25} />
      {inAdmin ? 'ADMIN MODE' : 'ADMIN'}
    </NextLink>
  );
}

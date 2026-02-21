import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { MarketingNavbar } from '@/components/layout/navbar';

export const metadata: Metadata = {
  robots: { index: true, follow: true },
};

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh flex flex-col bg-bg">
      <MarketingNavbar />
      <main className="flex-1">{children}</main>
    </div>
  );
}

import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { MarketingNavbar } from '@/components/layout/navbar';
import { PreviewBanner } from '@/components/preview/preview-banner';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <PreviewBanner />
      <MarketingNavbar />
      <main className="flex-1">{children}</main>
    </div>
  );
}

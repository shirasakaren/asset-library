import type { Metadata, Viewport } from 'next';
import { fontVariables } from '@/styles/fonts';
import { QueryProvider } from '@/providers/query-provider';
import { LocaleProvider } from '@/providers/locale-provider';
import { MeProvider } from '@/preview/session/me-provider';
import { PrimaryButtonGuard } from '@/providers/primary-button-guard';
import { Toaster } from '@/components/ui/toaster';
import { publicEnv } from '@/lib/env.public';
import { withBasePath } from '@/lib/base-path';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: {
    default: publicEnv.NEXT_PUBLIC_APP_NAME,
    template: `%s — ${publicEnv.NEXT_PUBLIC_APP_NAME}`,
  },
  description:
    'Internal asset library for the MGM research lab. Discover, publish, request and version Unity/Unreal/agnostic assets, all in one place.',
  applicationName: publicEnv.NEXT_PUBLIC_APP_NAME,
  metadataBase: new URL(publicEnv.NEXT_PUBLIC_APP_URL),
  icons: {
    icon: [{ url: withBasePath('/brand/favicon.svg'), type: 'image/svg+xml' }],
  },
  openGraph: {
    type: 'website',
    title: publicEnv.NEXT_PUBLIC_APP_NAME,
    description: 'A calm, premium asset library for MGM Laboratory.',
    siteName: publicEnv.NEXT_PUBLIC_APP_NAME,
  },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#ffffff',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={fontVariables}>
      <body className="bg-bg font-sans text-ink antialiased">
        <LocaleProvider>
          <QueryProvider>
            <MeProvider>
              <PrimaryButtonGuard>
                {children}
                <Toaster />
              </PrimaryButtonGuard>
            </MeProvider>
          </QueryProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}

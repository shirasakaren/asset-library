import type { Metadata, Viewport } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { SessionProvider } from 'next-auth/react';
import { fontVariables } from '@/styles/fonts';
import { QueryProvider } from '@/providers/query-provider';
import { SentryBootstrap } from '@/providers/sentry-provider';
import { PrimaryButtonGuard } from '@/providers/primary-button-guard';
import { Toaster } from '@/components/ui/toaster';
import { publicEnv } from '@/lib/env.public';
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
    icon: [{ url: '/brand/favicon.svg', type: 'image/svg+xml' }],
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

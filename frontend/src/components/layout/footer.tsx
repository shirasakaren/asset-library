import { getTranslations } from 'next-intl/server';
import { Logo } from '@/components/brand/logo';
import { Container } from './container';
import { FooterStrip } from '@/components/brand/footer-strip';
import { publicEnv } from '@/lib/env.public';

export async function Footer() {
  const t = await getTranslations('footer');
  const tnav = await getTranslations('nav');
  const year = new Date().getFullYear();

  const cols = [
    {
      heading: t('product'),
      links: [
        { label: t('discover'), href: '/' },
        { label: t('library'), href: '/library' },
        { label: t('publish'), href: '/publish' },
        { label: t('request'), href: '/request' },
      ],
    },
    {
      heading: t('company'),
      links: [
        { label: t('about'), href: '/about' },
        { label: t('team'), href: '/about#team' },
        { label: t('press'), href: '/about#press' },
      ],
    },
    {
      heading: tnav('community'),
      // Filter out missing community URLs so the footer never renders a
      // dead link (the navbar dropdown surfaces the disabled placeholder).
      links: [
        publicEnv.NEXT_PUBLIC_COMMUNITY_DOCS_URL
          ? { label: t('docs'), href: publicEnv.NEXT_PUBLIC_COMMUNITY_DOCS_URL, external: true }
          : null,
        publicEnv.NEXT_PUBLIC_COMMUNITY_LEARNING_URL
          ? { label: t('learning'), href: publicEnv.NEXT_PUBLIC_COMMUNITY_LEARNING_URL, external: true }
          : null,
        publicEnv.NEXT_PUBLIC_COMMUNITY_HELP_URL
          ? { label: t('help'), href: publicEnv.NEXT_PUBLIC_COMMUNITY_HELP_URL, external: true }
          : null,
      ].filter((l): l is { label: string; href: string; external: true } => l !== null),
    },
    {
      heading: t('legal'),
      links: [
        { label: t('privacy'), href: '/about#privacy' },
        { label: t('terms'), href: '/about#terms' },
        { label: t('cookies'), href: '/about#cookies' },
      ],
    },

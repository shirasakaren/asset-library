'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Logo } from '@/components/brand/logo';
import { Container } from './container';
import { FooterStrip } from '@/components/brand/footer-strip';
import { publicEnv } from '@/lib/env.public';
import { AttributionNotice } from '@/components/preview/attribution-notice';
import { ResetDemoDialog } from '@/components/preview/reset-demo-dialog';

export function Footer() {
  const t = useTranslations('footer');
  const tnav = useTranslations('nav');
  const tv = useTranslations('preview');
  const [resetOpen, setResetOpen] = useState(false);
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
          ? {
              label: t('learning'),
              href: publicEnv.NEXT_PUBLIC_COMMUNITY_LEARNING_URL,
              external: true,
            }
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
  ];

  return (
    <footer className="mt-24 border-t border-line bg-bg">
      <Container size="2xl">
        <div className="grid grid-cols-2 gap-10 py-14 md:grid-cols-[1.4fr_repeat(4,minmax(0,1fr))]">
          <div className="col-span-2 md:col-span-1">
            <Logo size="md" href="/" />
            <p className="mt-4 max-w-[280px] text-body-sm text-ink-3">{t('tagline')}</p>
          </div>
          {cols.map((col) => (
            <nav key={col.heading} aria-label={col.heading} className="text-body-sm">
              <h3 className="mb-3 text-eyebrow uppercase tracking-[0.12em] text-ink-3">
                {col.heading}
              </h3>
              <ul className="flex flex-col gap-2.5">
                {col.links.map((link) => (
                  <li key={`${col.heading}-${link.label}`}>
                    {'external' in link && link.external ? (
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-ink-2 transition-colors duration-120 hover:text-ink"
                      >
                        {link.label}
                      </a>
                    ) : (
                      <a
                        href={link.href}
                        className="text-ink-2 transition-colors duration-120 hover:text-ink"
                      >
                        {link.label}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
      </Container>
      <FooterStrip />
      <Container size="2xl">
        <div className="flex flex-col gap-4 py-6 text-caption text-ink-3">
          <AttributionNotice />
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
            <p className="geist-tnum">{t('copyright', { year: String(year) })}</p>
            <button
              type="button"
              onClick={() => setResetOpen(true)}
              className="text-ink-2 transition-colors duration-120 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              {tv('resetDemo')}
            </button>
          </div>
        </div>
      </Container>
      <ResetDemoDialog open={resetOpen} onOpenChange={setResetOpen} />
    </footer>
  );
}

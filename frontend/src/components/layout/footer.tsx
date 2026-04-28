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
  ];

  return (
    <footer className="mt-24 border-t border-line bg-bg">
      <Container size="2xl">
        <div className="grid grid-cols-2 md:grid-cols-[1.4fr_repeat(4,minmax(0,1fr))] gap-10 py-14">
          <div className="col-span-2 md:col-span-1">
            <Logo size="md" href="/" />
            <p className="mt-4 max-w-[280px] text-body-sm text-ink-3">{t('tagline')}</p>
          </div>
          {cols.map((col) => (
            <nav key={col.heading} aria-label={col.heading} className="text-body-sm">
              <h3 className="text-eyebrow uppercase tracking-[0.12em] text-ink-3 mb-3">
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
                        className="text-ink-2 hover:text-ink transition-colors duration-120"
                      >
                        {link.label}
                      </a>
                    ) : (
                      <a
                        href={link.href}
                        className="text-ink-2 hover:text-ink transition-colors duration-120"
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
        <div className="flex flex-wrap items-center justify-between gap-2 py-6 text-caption text-ink-3">
          <p className="geist-tnum">{t('copyright', { year: String(year) })}</p>
          <p className="hidden md:block">v1 · Part 1 of 4</p>
        </div>
      </Container>
    </footer>
  );
}

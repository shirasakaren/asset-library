import type { Metadata } from 'next';
import NextLink from 'next/link';
import { Library, Plug, GitBranch, ArrowRight } from 'lucide-react';
import { Container } from '@/components/layout/container';
import { Footer } from '@/components/layout/footer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { GeometricPattern } from '@/components/brand/geometric-pattern';
import { publicEnv } from '@/lib/env.public';

export const metadata: Metadata = {
  title: 'About',
  description:
    'MGM Asset Library is the lab’s centralized home for game, web, and mobile assets — versioned, searchable, and ready to drop into any engine.',
  robots: { index: true, follow: true },
  openGraph: {
    title: `About · ${publicEnv.NEXT_PUBLIC_APP_NAME}`,
    description:
      'A quiet place for our digital tools — built for the MGM research lab and partners.',
    type: 'website',
    images: [{ url: '/brand/og-default.png', width: 1200, height: 630 }],
  },
};

export const revalidate = 3600;

export default function AboutPage() {
  return (
    <>
      <Hero />
      <Vision />
      <Mission />
      <Problem />
      <Solution />
      <Access />
      <ClosingCta />
      <Footer />
    </>
  );
}

/* =====================================================================
 * Hero
 * ===================================================================== */
function Hero() {
  return (
    <section className="relative overflow-hidden">
      <Container size="2xl">
        <div className="relative grid lg:grid-cols-[1.3fr_1fr] gap-12 items-center pt-20 pb-24 lg:pt-28 lg:pb-32">
          <div>
            <Badge variant="info" size="lg" className="mb-5 uppercase tracking-[0.12em] text-[11px]">
              MGM Asset Library
            </Badge>
            {/* TODO: replace HERO_HEADLINE */}
            <h1 className="display-2xl text-ink">
              A quiet place for our <span className="text-brand-blue">digital tools</span>.
            </h1>
            {/* TODO: replace HERO_SUBHEAD */}
            <p className="mt-6 text-body-lg text-ink-2 max-w-prose">
              MGM Asset Library is the lab’s centralized home for game, web, and mobile assets —
              versioned, searchable, and ready to drop into any engine.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button size="lg" asChild>
                <a href="/auth/signin">Sign in</a>
              </Button>
              <Button size="lg" variant="ghost" asChild>
                <a href="mailto:hello@labmgm.org">Contact us</a>
              </Button>
            </div>
          </div>
          <div className="hidden lg:flex justify-end" aria-hidden>
            <div className="overflow-hidden rounded-[28px] border border-line">
              <GeometricPattern variant="square" seed="about-hero" size={84} rows={3} cols={3} />
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}

/* =====================================================================
 * Vision (asymmetric 5/7)
 * ===================================================================== */
function Vision() {
  return (
    <section className="border-t border-line">
      <Container size="2xl">
        <div className="grid md:grid-cols-12 gap-8 py-24 lg:py-32">
          <div className="md:col-span-5">
            <p className="text-eyebrow uppercase tracking-[0.12em] text-ink-3 mb-3">Vision</p>
            <h2 className="display-lg text-ink">What we believe</h2>
          </div>
          <div className="md:col-span-7">
            {/* TODO: replace VISION_COPY */}
            <p className="text-body-lg text-ink-2 leading-[1.7]">
              We believe research moves faster when tools are shared, organized, and easy to find.
              This library exists so a sound effect built for a CV experiment in 2022 can power a
              hardware demo in 2026 — without anyone re-recording it from scratch.
            </p>
            <p className="mt-5 text-body-lg text-ink-2 leading-[1.7]">
              Shared infrastructure is quiet infrastructure. We hide the pipeline and surface the
              work.
            </p>
          </div>
        </div>
      </Container>
    </section>
  );
}

/* =====================================================================
 * Mission (asymmetric 7/5, alternating direction)
 * ===================================================================== */
function Mission() {
  return (
    <section className="border-t border-line bg-surface-muted">
      <Container size="2xl">
        <div className="grid md:grid-cols-12 gap-8 py-24 lg:py-32 items-start">
          <div className="md:col-span-7 md:order-2">
            <p className="text-eyebrow uppercase tracking-[0.12em] text-ink-3 mb-3">Mission</p>
            <h2 className="display-lg text-ink mb-5">What we’re building</h2>
            {/* TODO: replace MISSION_COPY */}
            <p className="text-body-lg text-ink-2 leading-[1.7]">
              A single library that any MGM lab member or partner can search, save, and pull from
              directly inside Unity or Unreal. Every asset is versioned, license-stamped, and
              scanned for malware before it lands.
            </p>
            <p className="mt-5 text-body-lg text-ink-2 leading-[1.7]">
              Contributors publish from the web; consumers grab the same asset two clicks deep from
              inside their editor. No DM links. No "where did that texture go?".
            </p>
          </div>
          <div className="md:col-span-5 md:order-1">
            <div className="rounded-[28px] overflow-hidden border border-line bg-bg">
              <GeometricPattern variant="banner" seed="about-mission" size={64} rows={2} cols={4} />
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}

/* =====================================================================
 * Problem
 * ===================================================================== */
function Problem() {
  return (
    <section className="border-t border-line">
      <Container size="2xl">
        <div className="py-24 lg:py-32 max-w-[920px]">
          <p className="text-eyebrow uppercase tracking-[0.12em] text-ink-3 mb-3">
            Why this matters
          </p>
          <h2 className="display-lg text-ink mb-6">
            Lab assets live in five Slack threads and three USB drives.
          </h2>
          {/* TODO: replace PROBLEM_COPY */}
          <div className="grid md:grid-cols-2 gap-x-12 gap-y-4 text-body-lg text-ink-2 leading-[1.7]">
            <p>
              Without a library, every new project starts the same way — someone DMs a half-remembered
              link, someone else re-imports a model with the wrong scale, and the original is lost the
              moment the laptop is reformatted.
            </p>
            <p>
              We want the lab’s best tools to compound. That only happens when there’s one trustworthy
              place to put them, one search that finds them, and one click that installs them.
            </p>
          </div>
        </div>
      </Container>
    </section>
  );
}

/* =====================================================================
 * Solution — 3-up card grid (DS §4.4 forbids 4-up)
 * ===================================================================== */
function Solution() {
  const offerings = [
    {
      icon: Library,
      title: 'Centralized asset library',
      // TODO: replace OFFERING_1_BODY
      body:
        'Discover, save, and download Unity, Unreal, and engine-agnostic assets. Versioned, searchable, and license-stamped.',
    },
    {
      icon: Plug,
      title: 'In-engine plugins',
      // TODO: replace OFFERING_2_BODY
      body:
        'Pull any saved asset into your Unity or Unreal project directly — same account, same library, two clicks.',
    },
    {
      icon: GitBranch,
      title: 'Versioned + searchable',
      // TODO: replace OFFERING_3_BODY
      body:
        'Every version is preserved. Search by tag, engine, target platform, or license. Old work doesn’t disappear.',
    },
  ];
  return (
    <section id="whats-inside" className="border-t border-line bg-surface-muted">
      <Container size="2xl">
        <div className="py-24 lg:py-32">
          <div className="max-w-[760px]">
            <p className="text-eyebrow uppercase tracking-[0.12em] text-ink-3 mb-3">What’s inside</p>
            <h2 className="display-lg text-ink mb-12">Three surfaces, one library.</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            {offerings.map(({ icon: Icon, title, body }) => (
              <Card key={title} variant="outlined" padding="lg">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-[12px] bg-brand-blue-50 text-brand-blue">
                  <Icon className="h-5 w-5" strokeWidth={2.25} />
                </span>
                <h3 className="mt-5 font-display text-h2 text-ink tracking-[-0.01em]">{title}</h3>
                <p className="mt-2 text-body text-ink-2 leading-[1.7]">{body}</p>
              </Card>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}

/* =====================================================================
 * Access — the page's one inverse-dark moment (DS §2.3)
 * ===================================================================== */
function Access() {
  return (
    <section className="bg-surface-inverse text-white">
      <Container size="2xl">
        <div className="grid md:grid-cols-12 gap-8 py-24 lg:py-32 items-center">
          <div className="md:col-span-7">
            <p className="text-eyebrow uppercase tracking-[0.12em] text-white/60 mb-3">Access</p>
            <h2 className="display-lg !text-white">Internal use only.</h2>
            {/* TODO: replace ACCESS_COPY */}
            <p className="mt-6 text-body-lg text-white/85 leading-[1.7] max-w-prose">
              MGM Asset Library is gated behind sign-in. Only MGM Laboratory members and approved
              partners have accounts. This About page is the one public-facing surface — everything
              else lives behind authentication.
            </p>
            <p className="mt-4 text-body-lg text-white/85 leading-[1.7] max-w-prose">
              If you’re part of the lab and don’t yet have access, ask a workspace admin to invite
              you through Keycloak.
            </p>
          </div>
          <div className="md:col-span-5 hidden md:block">
            <div className="rounded-[28px] overflow-hidden border border-white/10 bg-white/[0.04]">
              <GeometricPattern variant="square" seed="about-access" size={72} rows={3} cols={3} />
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}

/* =====================================================================
 * Closing CTA
 * ===================================================================== */
function ClosingCta() {
  return (
    <section className="border-t border-line">
      <Container size="2xl">
        <div className="py-24 lg:py-32 text-center max-w-[680px] mx-auto">
          <h2 className="display-xl text-ink">Get started.</h2>
          <p className="mt-4 text-body-lg text-ink-2">
            Sign in with your MGM Keycloak account. The library, the plugins, and your saved work
            are all one click away.
          </p>
          <div className="mt-8 inline-flex items-center gap-2">
            <Button size="lg" asChild>
              <a href="/auth/signin">
                Sign in
                <ArrowRight className="h-4 w-4 ml-1" strokeWidth={2.25} />
              </a>
            </Button>
            <Button size="lg" variant="ghost" asChild>
              <NextLink href="#whats-inside">Learn more</NextLink>
            </Button>
          </div>
        </div>
      </Container>
    </section>
  );
}

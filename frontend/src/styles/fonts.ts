import localFont from 'next/font/local';

// Self-hosted variable fonts (latin subset, from Google Fonts: Bricolage
// Grotesque, Geist, Geist Mono; all SIL OFL). Loading them locally keeps the
// static export build free of network access.
export const bricolage = localFont({
  src: './fonts/bricolage-grotesque.woff2',
  weight: '400 800',
  display: 'swap',
  variable: '--font-display',
});

export const geist = localFont({
  src: './fonts/geist-sans.woff2',
  weight: '300 700',
  display: 'swap',
  variable: '--font-sans',
});

export const geistMono = localFont({
  src: './fonts/geist-mono.woff2',
  weight: '400 600',
  display: 'swap',
  variable: '--font-mono',
});

export const fontVariables = `${bricolage.variable} ${geist.variable} ${geistMono.variable}`;

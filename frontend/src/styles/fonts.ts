import { Bricolage_Grotesque, Geist, Geist_Mono } from 'next/font/google';

export const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-display',
});

export const geist = Geist({
  subsets: ['latin'],
  display: 'swap',
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-sans',
});

export const geistMono = Geist_Mono({
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500', '600'],
  variable: '--font-mono',
});

export const fontVariables = `${bricolage.variable} ${geist.variable} ${geistMono.variable}`;

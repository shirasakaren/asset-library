import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/app/**/*.{ts,tsx,mdx}',
    './src/components/**/*.{ts,tsx}',
    './src/providers/**/*.{ts,tsx}',
    './src/hooks/**/*.{ts,tsx}',
    './messages/**/*.json',
  ],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        'surface-muted': 'var(--surface-muted)',
        'surface-inverse': 'var(--surface-inverse)',
        ink: 'var(--ink)',
        'ink-2': 'var(--ink-2)',
        'ink-3': 'var(--ink-3)',
        'ink-4': 'var(--ink-4)',
        line: 'var(--line)',
        'line-strong': 'var(--line-strong)',
        focus: 'var(--focus)',
        brand: {
          blue: '#3a6dc5',
          yellow: '#f7bf33',
          red: '#f94141',
          green: '#0f8657',
          'blue-50': '#ecf1fa',
          'yellow-50': '#fef6e0',
          'red-50': '#fee5e5',
          'green-50': '#e2f1ea',
        },
      },
      fontFamily: {
        display: ['var(--font-display)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        'display-2xl': ['4.5rem', { lineHeight: '1.02', letterSpacing: '-0.03em', fontWeight: '600' }],
        'display-xl': ['3.5rem', { lineHeight: '1.05', letterSpacing: '-0.025em', fontWeight: '600' }],
        'display-lg': ['2.5rem', { lineHeight: '1.10', letterSpacing: '-0.02em', fontWeight: '600' }],
        h1: ['2rem', { lineHeight: '1.15', letterSpacing: '-0.015em', fontWeight: '600' }],
        h2: ['1.5rem', { lineHeight: '1.25', letterSpacing: '-0.01em', fontWeight: '600' }],
        h3: ['1.25rem', { lineHeight: '1.30', letterSpacing: '-0.005em', fontWeight: '600' }],
        h4: ['1.0625rem', { lineHeight: '1.40', fontWeight: '600' }],
        'body-lg': ['1.125rem', { lineHeight: '1.60' }],
        body: ['1rem', { lineHeight: '1.60' }],
        'body-sm': ['0.9375rem', { lineHeight: '1.55' }],
        caption: ['0.8125rem', { lineHeight: '1.50', letterSpacing: '0.005em', fontWeight: '500' }],
        mono: ['0.875rem', { lineHeight: '1.50' }],
        eyebrow: ['0.75rem', { lineHeight: '1.40', letterSpacing: '0.12em', fontWeight: '600' }],
      },
      borderRadius: {
        sm: '8px',
        DEFAULT: '12px',

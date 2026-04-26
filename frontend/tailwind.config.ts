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
        md: '12px',
        lg: '20px',
        xl: '28px',
        '2xl': '32px',
      },
      boxShadow: {
        1: '0 1px 2px rgba(14,17,22,0.04), 0 1px 1px rgba(14,17,22,0.03)',
        2: '0 6px 24px -8px rgba(14,17,22,0.10), 0 2px 6px -2px rgba(14,17,22,0.05)',
        3: '0 24px 60px -20px rgba(14,17,22,0.18), 0 4px 12px -4px rgba(14,17,22,0.06)',
      },
      transitionTimingFunction: {
        'out-soft': 'cubic-bezier(0.22, 1, 0.36, 1)',
        'in-out-soft': 'cubic-bezier(0.65, 0, 0.35, 1)',
        spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      transitionDuration: {
        120: '120ms',
        200: '200ms',
        320: '320ms',
        520: '520ms',
        800: '800ms',
      },
      maxWidth: {
        prose: '640px',
        container: '1280px',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.96)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        spin: { to: { transform: 'rotate(360deg)' } },
      },
      animation: {
        'fade-in': 'fade-in 200ms cubic-bezier(0.22, 1, 0.36, 1) forwards',
        'scale-in': 'scale-in 320ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
        'slide-up': 'slide-up 320ms cubic-bezier(0.22, 1, 0.36, 1) forwards',
        shimmer: 'shimmer 1.6s linear infinite',
      },
    },
  },
  plugins: [],
};

export default config;

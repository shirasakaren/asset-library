import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/unit/**/*.{test,spec}.{ts,tsx}'],
    css: false,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      'next/font/google': resolve(__dirname, 'tests/stubs/next-font.ts'),
      'next-intl': resolve(__dirname, 'tests/stubs/next-intl.ts'),
      'next/navigation': resolve(__dirname, 'tests/stubs/next-navigation.ts'),
    },
  },
});

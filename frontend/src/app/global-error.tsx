'use client';

import { useEffect } from 'react';
import { captureException } from '@/lib/sentry';

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    void captureException(error, { digest: error.digest });
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily:
            'ui-sans-serif, system-ui, "Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif',
          background: '#ffffff',
          color: '#0e1116',
          minHeight: '100dvh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
        }}
      >
        <div style={{ maxWidth: 480 }}>
          <p
            style={{
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              fontSize: 12,
              color: '#6b7280',
              fontWeight: 600,
            }}
          >
            Critical error
          </p>
          <h1 style={{ fontSize: 32, lineHeight: 1.15, margin: '12px 0 12px' }}>
            We hit a serious issue

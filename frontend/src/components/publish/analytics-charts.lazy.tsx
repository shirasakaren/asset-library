'use client';

import dynamic from 'next/dynamic';

/**
 * Client-only lazy wrapper for the recharts-powered analytics charts.
 *
 * `next/dynamic({ ssr: false })` is only allowed inside a Client Component, so
 * the server analytics page imports this wrapper instead of calling
 * `next/dynamic` directly. This keeps recharts out of the initial/shared
 * bundle; it loads only when the analytics page mounts.
 */
export const AnalyticsCharts = dynamic(
  () => import('./analytics-charts').then((m) => m.AnalyticsCharts),
  {
    ssr: false,
    loading: () => (
      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-[260px] animate-pulse rounded-[16px] border border-line bg-surface-muted"
          />
        ))}
      </div>
    ),
  },
);

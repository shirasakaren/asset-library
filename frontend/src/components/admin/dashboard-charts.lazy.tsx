'use client';

import dynamic from 'next/dynamic';

/**
 * Client-only lazy wrapper for the recharts-powered dashboard charts.
 *
 * `next/dynamic({ ssr: false })` is only allowed inside a Client Component, so
 * the server `admin/page.tsx` imports this wrapper instead of calling
 * `next/dynamic` directly. This keeps recharts out of the initial/shared
 * bundle; it loads only when the admin dashboard mounts.
 */
export const DashboardCharts = dynamic(
  () => import('./dashboard-charts').then((m) => m.DashboardCharts),
  {
    ssr: false,
    loading: () => (
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-[300px] animate-pulse rounded-[16px] border border-line bg-surface-muted"
          />
        ))}
      </div>
    ),
  },
);

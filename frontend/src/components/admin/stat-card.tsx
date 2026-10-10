import NextLink from 'next/link';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: string;
  trend?: { delta: number; suffix?: string };
  href?: string;
  tone?: 'neutral' | 'warn' | 'danger' | 'success';
}

const TONE: Record<NonNullable<StatCardProps['tone']>, string> = {
  neutral: 'bg-surface border-line',
  warn: 'bg-brand-yellow-50 border-brand-yellow/30',
  danger: 'bg-brand-red-50 border-brand-red/20',
  success: 'bg-brand-green-50 border-brand-green/20',
};

export function StatCard({ label, value, trend, href, tone = 'neutral' }: StatCardProps) {
  const body = (
    <div
      className={cn(
        'min-w-0 rounded-[16px] border p-4 transition-all duration-200 ease-out-soft',
        TONE[tone],
        href && 'hover:border-ink/20 cursor-pointer hover:-translate-y-px hover:shadow-2',
      )}
    >
      <p className="truncate text-eyebrow uppercase tracking-[0.12em] text-ink-3">{label}</p>
      {/* Eight cards share one row on wide screens: scale the figure down so "34,948" is never clipped. */}
      <p
        title={value}
        className="geist-tnum mt-2 truncate font-display text-[1.75rem] leading-none tracking-[-0.02em] text-ink md:text-[2rem] xl:text-display-lg"
      >
        {value}
      </p>
      {trend ? (
        <p
          className={cn(
            'geist-tnum mt-2 inline-flex items-center gap-1 text-caption font-medium',
            trend.delta >= 0 ? 'text-brand-green' : 'text-brand-red',
          )}
        >
          {trend.delta >= 0 ? (
            <ArrowUp className="h-3 w-3" strokeWidth={2.25} />
          ) : (
            <ArrowDown className="h-3 w-3" strokeWidth={2.25} />
          )}
          {Math.abs(trend.delta)}
          {trend.suffix ?? '%'}
        </p>
      ) : null}
    </div>
  );
  if (!href) return body;
  return (
    <NextLink
      href={href}
      className="block rounded-[16px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
    >
      {body}
    </NextLink>
  );
}

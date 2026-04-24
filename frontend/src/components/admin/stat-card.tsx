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
        'rounded-[16px] border p-4 transition-all duration-200 ease-out-soft',
        TONE[tone],
        href && 'hover:-translate-y-px hover:shadow-2 hover:border-ink/20 cursor-pointer',
      )}
    >
      <p className="text-eyebrow uppercase tracking-[0.12em] text-ink-3 whitespace-nowrap">{label}</p>
      <p className="mt-2 font-display text-display-lg text-ink geist-tnum tracking-[-0.02em] leading-none">
        {value}
      </p>
      {trend ? (
        <p
          className={cn(
            'mt-2 inline-flex items-center gap-1 text-caption font-medium geist-tnum',
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
      className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 rounded-[16px]"
    >
      {body}
    </NextLink>
  );
}

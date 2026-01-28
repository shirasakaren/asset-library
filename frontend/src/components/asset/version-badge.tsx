import { cn } from '@/lib/utils';

interface VersionBadgeProps {
  semver: string;
  isLatest?: boolean;
  className?: string;
  size?: 'sm' | 'md';
}

export function VersionBadge({ semver, isLatest, className, size = 'md' }: VersionBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full font-mono select-none whitespace-nowrap',
        isLatest
          ? 'bg-brand-blue-50 text-brand-blue border border-brand-blue/15'
          : 'bg-surface-muted text-ink-2 border border-line',
        size === 'sm' ? 'h-5 px-2 text-[11px]' : 'h-6 px-2.5 text-[12px]',
        className,
      )}
    >
      <span aria-hidden className="opacity-70">v</span>
      <span className="geist-tnum">{semver}</span>
      {isLatest ? <span className="text-[10px] font-semibold opacity-90">LATEST</span> : null}
    </span>
  );
}

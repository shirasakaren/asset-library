import { cn } from '@/lib/utils';

interface SpinnerProps {
  size?: 14 | 16 | 20 | 24;
  className?: string;
  'aria-label'?: string;
}

/**
 * Restrained inline loading indicator. DS §7.15.
 * Uses currentColor so it inherits from the surrounding text/button.
 */
export function Spinner({ size = 16, className, 'aria-label': ariaLabel = 'Loading' }: SpinnerProps) {
  return (
    <svg
      role="status"
      aria-label={ariaLabel}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={cn('animate-spin', className)}
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.18" strokeWidth="3" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

import { forwardRef, type HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeStyles = cva(
  'inline-flex items-center gap-1 h-6 px-2.5 rounded-full text-[12px] font-medium tracking-[0.005em] whitespace-nowrap select-none',
  {
    variants: {
      variant: {
        neutral: 'bg-surface-muted text-ink-2 border border-line',
        info: 'bg-brand-blue-50 text-brand-blue',
        success: 'bg-brand-green-50 text-brand-green',
        warning: 'bg-brand-yellow-50 text-ink',
        danger: 'bg-brand-red-50 text-brand-red',
        outline: 'bg-transparent text-ink-2 border border-line-strong',
        solid: 'bg-ink text-white',
      },
      size: {
        sm: 'h-5 px-2 text-[11px]',
        md: 'h-6 px-2.5 text-[12px]',
        lg: 'h-7 px-3 text-[13px]',
      },
    },
    defaultVariants: { variant: 'neutral', size: 'md' },
  },
);

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeStyles> {}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant, size, ...props }, ref) => (
    <span ref={ref} className={cn(badgeStyles({ variant, size }), className)} {...props} />
  ),
);
Badge.displayName = 'Badge';

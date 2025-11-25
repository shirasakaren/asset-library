import { forwardRef, type HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const cardStyles = cva('rounded-[20px] transition-[transform,box-shadow] duration-200 ease-out-soft', {
  variants: {
    variant: {
      outlined:
        'bg-surface border border-line hover:border-line-strong hover:-translate-y-px hover:shadow-2',
      tinted: 'bg-surface-muted border border-transparent',
      inverse: 'bg-surface-inverse text-white border border-transparent',
      flat: 'bg-surface border border-line',
    },
    padding: {
      none: 'p-0',
      sm: 'p-4',
      md: 'p-5',
      lg: 'p-7',
    },
    interactive: { true: 'cursor-pointer', false: '' },
  },
  defaultVariants: { variant: 'outlined', padding: 'md', interactive: false },
});

export interface CardProps extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof cardStyles> {}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant, padding, interactive, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(cardStyles({ variant, padding, interactive }), className)}
      {...props}
    />
  ),
);
Card.displayName = 'Card';

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-start justify-between gap-3 mb-3', className)} {...props} />;

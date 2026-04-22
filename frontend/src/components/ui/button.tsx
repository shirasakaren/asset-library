'use client';

import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { Spinner } from './spinner';

const buttonStyles = cva(
  [
    'group relative inline-flex items-center justify-center gap-2 whitespace-nowrap',
    'font-sans font-medium tracking-[-0.005em]',
    'transition-[transform,background-color,border-color,color,box-shadow] duration-200 ease-out-soft',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2',
    'disabled:cursor-not-allowed disabled:opacity-60',
    'active:translate-y-px',
    'select-none',
  ],
  {
    variants: {
      variant: {
        primary: [
          'bg-ink text-white border border-ink',
          'hover:bg-[#1a1f29] hover:border-[#1a1f29]',
          'shadow-1',
        ],
        secondary: [
          'bg-surface text-ink border border-line-strong',
          'hover:bg-surface-muted hover:border-ink/30',
        ],
        ghost: ['bg-transparent text-ink border border-transparent', 'hover:bg-surface-muted'],
        accent: [
          'bg-brand-blue text-white border border-brand-blue',
          'hover:bg-[#2d5cb0] hover:border-[#2d5cb0]',
          'shadow-1',
        ],
        danger: [
          'bg-brand-red text-white border border-brand-red',
          'hover:bg-[#e23333] hover:border-[#e23333]',
        ],
        outline: [
          'bg-transparent text-ink border border-ink',
          'hover:bg-ink hover:text-white',
        ],
      },
      size: {
        sm: 'h-8 px-3 text-[13px] rounded-[10px]',
        md: 'h-10 px-4 text-[14px] rounded-[12px]',
        lg: 'h-12 px-5 text-[15px] rounded-[14px]',
        icon: 'h-10 w-10 rounded-[12px]',
        'icon-sm': 'h-8 w-8 rounded-[10px]',
      },
      fullWidth: { true: 'w-full', false: '' },
    },
    defaultVariants: { variant: 'primary', size: 'md', fullWidth: false },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonStyles> {
  asChild?: boolean;
  loading?: boolean;
  iconOnly?: boolean;
  leadingIcon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      fullWidth,
      asChild,
      loading,
      disabled,
      iconOnly,
      leadingIcon,
      trailingIcon,
      children,
      type,
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : 'button';
    const resolvedSize = iconOnly && !size ? 'icon' : size;
    return (
      <Comp
        ref={ref}
        type={asChild ? undefined : (type ?? 'button')}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={cn(buttonStyles({ variant, size: resolvedSize, fullWidth }), className)}
        {...props}
      >
        {asChild ? (
          // Radix Slot requires exactly ONE child element and merges the
          // button's props/classes onto it. Pass the caller's element straight
          // through; wrapping it or injecting icon siblings would hand Slot an
          // array and throw "React.Children.only expected a single child",
          // which 500'd every page rendering a <Button asChild>.
          children
        ) : (
          <>
            {loading ? (
              <Spinner size={size === 'sm' ? 14 : 16} className="text-current" />
            ) : (
              leadingIcon
            )}
            {!iconOnly ? <span className="inline-flex items-center">{children}</span> : null}
            {iconOnly && !loading ? children : null}
            {!loading && trailingIcon ? trailingIcon : null}
          </>
        )}
      </Comp>
    );
  },
);
Button.displayName = 'Button';

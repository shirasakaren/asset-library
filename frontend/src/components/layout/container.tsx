import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const sizes = {
  xs: 'max-w-[640px]',
  sm: 'max-w-[768px]',
  md: 'max-w-[960px]',
  lg: 'max-w-[1120px]',
  xl: 'max-w-[1280px]',
  '2xl': 'max-w-[1440px]',
  full: 'max-w-none',
} as const;

interface ContainerProps extends HTMLAttributes<HTMLDivElement> {
  size?: keyof typeof sizes;
}

export const Container = forwardRef<HTMLDivElement, ContainerProps>(
  ({ className, size = 'xl', ...props }, ref) => (
    <div
      ref={ref}
      className={cn('mx-auto w-full px-6 md:px-10 lg:px-16', sizes[size], className)}
      {...props}
    />
  ),
);
Container.displayName = 'Container';

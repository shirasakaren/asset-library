import type { ComponentType, SVGProps } from 'react';
import { cn } from '@/lib/utils';

type LucideIcon = ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>;

interface IconProps {
  as: LucideIcon;
  size?: 16 | 20 | 24;
  strokeWidth?: number;
  className?: string;
  'aria-hidden'?: boolean;
  'aria-label'?: string;
}

/**
 * Wraps a Lucide icon with the DS-specified stroke width (2.25)
 * and standard sizes (16/20/24, default 20).
 */
export function Icon({
  as: Component,
  size = 20,
  strokeWidth = 2.25,
  className,
  'aria-hidden': ariaHidden = true,
  'aria-label': ariaLabel,
}: IconProps) {
  return (
    <Component
      width={size}
      height={size}
      strokeWidth={strokeWidth}
      className={cn('shrink-0', className)}
      aria-hidden={ariaLabel ? undefined : ariaHidden}
      aria-label={ariaLabel}
      role={ariaLabel ? 'img' : undefined}
    />
  );
}

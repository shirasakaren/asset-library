'use client';

import { forwardRef } from 'react';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { cn } from '@/lib/utils';

export const Switch = forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn(
      'peer inline-flex h-6 w-10 shrink-0 items-center rounded-full border border-transparent',
      'transition-colors duration-200 ease-out-soft',
      'bg-line-strong data-[state=checked]:bg-ink',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2',
      'disabled:cursor-not-allowed disabled:opacity-50',
      className,
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb
      className={cn(
        'pointer-events-none block h-5 w-5 rounded-full bg-white shadow-1',
        'transition-transform duration-200 ease-out-soft',
        'translate-x-0.5 data-[state=checked]:translate-x-[18px]',
      )}
    />
  </SwitchPrimitive.Root>
));
Switch.displayName = 'Switch';

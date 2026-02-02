'use client';

import { forwardRef } from 'react';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { Check, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

export const Checkbox = forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      'peer inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center',
      'rounded-[6px] border border-line-strong bg-surface',
      'transition-colors duration-120 ease-out-soft',
      'hover:border-ink/40',
      'data-[state=checked]:bg-ink data-[state=checked]:border-ink data-[state=checked]:text-white',
      'data-[state=indeterminate]:bg-ink data-[state=indeterminate]:border-ink data-[state=indeterminate]:text-white',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2',
      'disabled:cursor-not-allowed disabled:opacity-50',
      className,
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className="inline-flex items-center justify-center">
      {props.checked === 'indeterminate' ? (
        <Minus className="h-3 w-3" strokeWidth={3} />
      ) : (
        <Check className="h-3 w-3" strokeWidth={3} />
      )}
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = 'Checkbox';

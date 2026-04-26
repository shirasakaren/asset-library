'use client';

import { forwardRef, type ReactNode } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export const Modal = DialogPrimitive.Root;
export const ModalTrigger = DialogPrimitive.Trigger;
export const ModalClose = DialogPrimitive.Close;
export const ModalPortal = DialogPrimitive.Portal;

const sizeMap = {
  sm: 'max-w-[480px]',
  md: 'max-w-[560px]',
  lg: 'max-w-[720px]',
  xl: 'max-w-[920px]',
} as const;

export const ModalOverlay = forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-ink/30 backdrop-blur-[2px]',
      'data-[state=open]:animate-fade-in',
      'data-[state=closed]:opacity-0 data-[state=closed]:transition-opacity data-[state=closed]:duration-200',
      className,
    )}
    {...props}
  />
));
ModalOverlay.displayName = 'ModalOverlay';

interface ModalContentProps extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  size?: keyof typeof sizeMap;
  hideClose?: boolean;
}

export const ModalContent = forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  ModalContentProps
>(({ className, size = 'md', hideClose, children, ...props }, ref) => (
  <ModalPortal>
    <ModalOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'mgm-modal-content',
        'fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2',
        'w-[calc(100%-2rem)]',
        sizeMap[size],
        'bg-surface rounded-[28px] shadow-3 border border-line',
        'p-7',
        'focus-visible:outline-none',
        'max-h-[calc(100dvh-2rem)] overflow-y-auto',
        className,
      )}
      {...props}
    >
      {children}
      {!hideClose ? (
        <DialogPrimitive.Close
          aria-label="Close"
          className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-[10px] text-ink-3 hover:bg-surface-muted hover:text-ink transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
        >
          <X className="h-4 w-4" strokeWidth={2.25} />
        </DialogPrimitive.Close>
      ) : null}
    </DialogPrimitive.Content>
  </ModalPortal>
));
ModalContent.displayName = 'ModalContent';

export function ModalHeader({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mb-4 pr-9', className)}>{children}</div>;
}

export const ModalTitle = forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      'font-display text-h2 font-semibold text-ink tracking-[-0.01em] leading-tight',
      className,
    )}
    {...props}
  />
));
ModalTitle.displayName = 'ModalTitle';

export const ModalDescription = forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-body-sm text-ink-3 mt-1.5', className)}
    {...props}
  />
));
ModalDescription.displayName = 'ModalDescription';

export function ModalFooter({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('mt-6 flex items-center justify-end gap-2', className)}>{children}</div>
  );
}

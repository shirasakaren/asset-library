'use client';

import { Toaster as SonnerToaster, toast as sonnerToast } from 'sonner';

export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      richColors={false}
      closeButton
      duration={4500}
      gap={10}
      visibleToasts={4}
      toastOptions={{
        unstyled: false,
        classNames: {
          toast:
            '!font-sans !rounded-[14px] !border !border-line !bg-surface !shadow-2 !text-ink !p-4',
          title: '!font-semibold !text-[14px] !text-ink',
          description: '!text-[13px] !text-ink-2',
          actionButton:
            '!bg-ink !text-white !rounded-[10px] !px-3 !h-8 !text-[13px] !font-medium',
          cancelButton:
            '!bg-transparent !text-ink-2 !rounded-[10px] !px-3 !h-8 !text-[13px] !font-medium',
          success: '!border-brand-green/20 !bg-brand-green-50',
          error: '!border-brand-red/20 !bg-brand-red-50',
          info: '!border-brand-blue/20 !bg-brand-blue-50',
          warning: '!border-brand-yellow/40 !bg-brand-yellow-50',
        },
      }}
    />
  );
}

export const toast = sonnerToast;

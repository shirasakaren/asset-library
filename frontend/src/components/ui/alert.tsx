import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Info, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

const alertStyles = cva('flex gap-3 rounded-[14px] border p-4 text-body-sm', {
  variants: {
    variant: {
      info: 'bg-brand-blue-50 border-brand-blue/15 text-ink',
      success: 'bg-brand-green-50 border-brand-green/15 text-ink',
      warning: 'bg-brand-yellow-50 border-brand-yellow/30 text-ink',
      danger: 'bg-brand-red-50 border-brand-red/15 text-ink',
      neutral: 'bg-surface-muted border-line text-ink',
    },
  },
  defaultVariants: { variant: 'info' },
});

const iconFor = {
  info: <Info className="h-5 w-5 text-brand-blue" strokeWidth={2.25} />,
  success: <CheckCircle2 className="h-5 w-5 text-brand-green" strokeWidth={2.25} />,
  warning: <AlertTriangle className="h-5 w-5 text-[#a16800]" strokeWidth={2.25} />,
  danger: <XCircle className="h-5 w-5 text-brand-red" strokeWidth={2.25} />,
  neutral: <Info className="h-5 w-5 text-ink-3" strokeWidth={2.25} />,
};

export interface AlertProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'title'>,
    VariantProps<typeof alertStyles> {
  title?: ReactNode;
  icon?: ReactNode | false;
  action?: ReactNode;
}

export const Alert = forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant = 'info', title, icon, action, children, ...props }, ref) => (
    <div ref={ref} role="alert" className={cn(alertStyles({ variant }), className)} {...props}>
      {icon === false ? null : (
        <div className="mt-0.5 shrink-0">{icon ?? iconFor[variant ?? 'info']}</div>
      )}
      <div className="flex-1 min-w-0">
        {title ? <div className="font-semibold text-ink mb-0.5">{title}</div> : null}
        <div className="text-ink-2">{children}</div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  ),
);
Alert.displayName = 'Alert';

export function InlineAlert(props: AlertProps) {
  return <Alert {...props} />;
}

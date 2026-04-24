'use client';

import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes, type ReactNode } from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';
import { cn } from '@/lib/utils';

/* ===================== Label ===================== */

interface LabelProps extends React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> {
  required?: boolean;
}

export const Label = forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, children, required, ...props }, ref) => (
    <LabelPrimitive.Root
      ref={ref}
      className={cn(
        'inline-flex items-center gap-1 text-caption text-ink-2 font-medium select-none',
        className,
      )}
      {...props}
    >
      {children}
      {required ? <span className="text-brand-red" aria-hidden>*</span> : null}
    </LabelPrimitive.Root>
  ),
);
Label.displayName = 'Label';

/* ===================== Helper / Error ===================== */

export function HelperText({
  children,
  className,
  id,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <p id={id} className={cn('text-caption text-ink-3 mt-1.5', className)}>
      {children}
    </p>
  );
}

export function FieldError({
  children,
  className,
  id,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <p
      id={id}
      role="alert"
      className={cn('text-caption text-brand-red mt-1.5 font-medium', className)}
    >
      {children}
    </p>
  );
}

/* ===================== Input ===================== */

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  inputSize?: 'sm' | 'md' | 'lg';
}

const inputBase =
  'block w-full bg-surface text-ink placeholder:text-ink-4 border border-line-strong rounded-[12px] transition-colors duration-120 focus-visible:border-ink focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-0 focus-visible:outline-none disabled:bg-surface-muted disabled:text-ink-4 disabled:cursor-not-allowed';

const sizeMap = {
  sm: 'h-9 px-3 text-[14px] rounded-[10px]',
  md: 'h-11 px-3.5 text-[15px]',
  lg: 'h-12 px-4 text-[16px] rounded-[14px]',
} as const;

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    { className, invalid, leadingIcon, trailingIcon, inputSize = 'md', type = 'text', ...props },
    ref,
  ) => {
    if (leadingIcon || trailingIcon) {
      return (
        <div
          className={cn(
            'relative flex items-center w-full',
            invalid && '[&_input]:border-brand-red [&_input]:focus-visible:ring-brand-red',
          )}
        >
          {leadingIcon ? (
            <span className="absolute left-3 inline-flex text-ink-3" aria-hidden>
              {leadingIcon}
            </span>
          ) : null}
          <input
            ref={ref}
            type={type}
            className={cn(
              inputBase,
              sizeMap[inputSize],
              leadingIcon && 'pl-10',
              trailingIcon && 'pr-10',
              invalid && 'border-brand-red focus-visible:ring-brand-red',
              className,
            )}
            aria-invalid={invalid || undefined}
            {...props}
          />
          {trailingIcon ? (
            <span className="absolute right-3 inline-flex text-ink-3" aria-hidden>
              {trailingIcon}
            </span>
          ) : null}
        </div>
      );
    }
    return (
      <input
        ref={ref}
        type={type}
        className={cn(
          inputBase,
          sizeMap[inputSize],
          invalid && 'border-brand-red focus-visible:ring-brand-red',
          className,
        )}
        aria-invalid={invalid || undefined}
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';

/* ===================== Textarea ===================== */

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, invalid, rows = 4, ...props }, ref) => (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(
        inputBase,
        'py-2.5 px-3.5 text-[15px] resize-y min-h-[88px]',
        invalid && 'border-brand-red focus-visible:ring-brand-red',
        className,
      )}
      aria-invalid={invalid || undefined}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';

/* ===================== Field shell ===================== */

interface FieldProps {
  id?: string;
  label?: ReactNode;
  helper?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  children: ReactNode;
  className?: string;
}

/**
 * Convenience wrapper: <Field label helper error>...</Field>
 * Wires aria-describedby / aria-invalid via DOM ids if provided.
 */
export function Field({ id, label, helper, error, required, children, className }: FieldProps) {
  const helperId = id ? `${id}-helper` : undefined;
  const errorId = id ? `${id}-error` : undefined;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label ? (
        <Label htmlFor={id} required={required}>
          {label}
        </Label>
      ) : null}
      {children}
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
      {!error && helper ? <HelperText id={helperId}>{helper}</HelperText> : null}
    </div>
  );
}

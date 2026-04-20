'use client';

import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FilterSectionProps {
  title: ReactNode;
  activeCount?: number;
  defaultOpen?: boolean;
  children: ReactNode;
}

export function FilterSection({
  title,
  activeCount = 0,
  defaultOpen = true,
  children,
}: FilterSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="py-4 border-b border-line last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 text-left"
        aria-expanded={open}
      >
        <span className="text-eyebrow uppercase tracking-[0.12em] text-ink-2">{title}</span>
        <span className="inline-flex items-center gap-2">
          {activeCount > 0 ? (
            <span className="inline-flex h-5 px-1.5 items-center rounded-full bg-brand-blue text-white text-[10px] font-semibold geist-tnum">
              {activeCount}
            </span>
          ) : null}
          <ChevronDown
            className={cn('h-3.5 w-3.5 text-ink-3 transition-transform duration-200', open && 'rotate-180')}
            strokeWidth={2.25}
          />
        </span>
      </button>
      <div className={cn('overflow-hidden transition-all duration-200', open ? 'mt-3' : 'h-0 mt-0')}>
        {open ? children : null}
      </div>
    </section>
  );
}

interface ChipFilterProps {
  options: { label: string; value: string }[];
  values: string[];
  onChange: (next: string[]) => void;
  multi?: boolean;
}

export function ChipFilter({ options, values, onChange, multi = true }: ChipFilterProps) {
  const toggle = (value: string) => {
    if (multi) {
      onChange(values.includes(value) ? values.filter((v) => v !== value) : [...values, value]);
    } else {
      onChange(values.includes(value) ? [] : [value]);
    }
  };
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => {
        const active = values.includes(opt.value);
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => toggle(opt.value)}
            aria-pressed={active}
            className={cn(
              'inline-flex items-center h-7 px-2.5 rounded-full text-[12.5px] font-medium border transition-colors duration-120',
              active
                ? 'bg-ink text-white border-ink'
                : 'bg-surface text-ink-2 border-line hover:border-ink/30 hover:text-ink',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2',
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

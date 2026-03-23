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

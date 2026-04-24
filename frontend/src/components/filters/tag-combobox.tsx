'use client';

import { useState, type KeyboardEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, X } from 'lucide-react';
import { useAuthedFetch } from '@/lib/api/client';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';
import { queryKeys, STALE_TIMES } from '@/lib/api/queries';
import { Badge } from '@/components/ui/badge';
import type { Tag } from '@/lib/api/types';
import { cn } from '@/lib/utils';

interface TagComboboxProps {
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}

export function TagCombobox({ values, onChange, placeholder }: TagComboboxProps) {
  const fetcher = useAuthedFetch();
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const debouncedQuery = useDebouncedValue(query, 180);

  const suggestions = useQuery({
    queryKey: queryKeys.tags(debouncedQuery),
    queryFn: () => fetcher<Tag[]>('/tags', { query: { q: debouncedQuery, limit: 8 } }),
    enabled: focused && debouncedQuery.length > 0,
    staleTime: STALE_TIMES.tags,
  });

  const add = (slug: string) => {
    if (!slug || values.includes(slug)) return;
    onChange([...values, slug]);
    setQuery('');
  };

  const remove = (slug: string) => onChange(values.filter((v) => v !== slug));

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && query.trim()) {
      e.preventDefault();
      add(query.trim().toLowerCase().replace(/\s+/g, '-'));
    } else if (e.key === 'Backspace' && !query && values.length) {
      onChange(values.slice(0, -1));
    }
  };

  return (
    <div className="relative">
      <div className="flex flex-wrap items-center gap-1.5 p-2 rounded-[12px] border border-line bg-surface focus-within:ring-2 focus-within:ring-focus focus-within:ring-offset-2">
        {values.map((slug) => (
          <Badge
            key={slug}
            variant="neutral"
            className="inline-flex items-center gap-1 pr-1"
          >
            {slug}
            <button
              type="button"
              onClick={() => remove(slug)}
              aria-label={`Remove tag ${slug}`}
              className="inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-line"
            >
              <X className="h-3 w-3" strokeWidth={2.25} />
            </button>
          </Badge>
        ))}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKey}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder={placeholder}
          className="flex-1 min-w-[120px] bg-transparent outline-none text-[13.5px] placeholder:text-ink-4"
        />
      </div>
      {focused && debouncedQuery && (suggestions.data?.length ?? 0) > 0 ? (
        <ul
          role="listbox"
          className={cn(
            'absolute z-10 left-0 right-0 mt-1.5 max-h-[240px] overflow-y-auto rounded-[12px] border border-line bg-surface shadow-2 p-1.5',
          )}
        >
          {suggestions.data?.slice(0, 8).map((tag) => (
            <li key={tag.slug}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  add(tag.slug);
                }}
                className="w-full flex items-center justify-between gap-2 px-2.5 h-9 rounded-[8px] text-left hover:bg-surface-muted/60 transition-colors duration-120"
              >
                <span className="inline-flex items-center gap-2 text-[13.5px]">
                  <Plus className="h-3 w-3 text-ink-3" strokeWidth={2.25} />
                  {tag.displayName}
                  <span className="font-mono text-[11px] text-ink-3">{tag.slug}</span>
                </span>
                <span className="text-caption text-ink-3 geist-tnum">{tag.usageCount}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

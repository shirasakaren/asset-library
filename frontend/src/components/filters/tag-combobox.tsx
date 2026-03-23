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

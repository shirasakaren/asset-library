'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import NextLink from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Search, ArrowRight, Tag as TagIcon, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import { useAuthedFetch } from '@/lib/api/client';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';
import { queryKeys, STALE_TIMES } from '@/lib/api/queries';
import { logEvent } from '@/lib/logger.events';
import type { SearchAssetsResponse, Tag } from '@/lib/api/types';
import { cn } from '@/lib/utils';

interface SearchBarProps {
  className?: string;
}

interface FlatRow {
  type: 'tag' | 'asset' | 'see-all';
  id: string;
}

export function SearchBar({ className }: SearchBarProps) {
  const router = useRouter();
  const fetcher = useAuthedFetch();
  const t = useTranslations('common');
  const tNav = useTranslations('nav.typeahead');

  const [value, setValue] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const debouncedQuery = useDebouncedValue(value, 200);

  const tagsQ = useQuery({
    queryKey: queryKeys.searchTags(debouncedQuery),
    queryFn: () => fetcher<Tag[]>('/search/tags', { query: { q: debouncedQuery, limit: 5 } }),
    enabled: open && debouncedQuery.length > 1,
    staleTime: STALE_TIMES.search,
  });

  const assetsQ = useQuery({
    queryKey: queryKeys.searchTypeahead(debouncedQuery),
    queryFn: () =>
      fetcher<SearchAssetsResponse>('/search/assets', {
        query: { q: debouncedQuery, limit: 5 },
      }),
    enabled: open && debouncedQuery.length > 1,
    staleTime: STALE_TIMES.search,
  });

  const isFetching = tagsQ.isFetching || assetsQ.isFetching;

  const rows = useMemo<FlatRow[]>(() => {
    const list: FlatRow[] = [];
    for (const tag of tagsQ.data ?? []) list.push({ type: 'tag', id: `tag-${tag.slug}` });
    for (const a of assetsQ.data?.hits ?? []) list.push({ type: 'asset', id: `asset-${a.id}` });
    if (debouncedQuery) list.push({ type: 'see-all', id: 'see-all' });
    return list;
  }, [tagsQ.data, assetsQ.data, debouncedQuery]);

  useEffect(() => {
    setActiveIndex(0);
  }, [rows.length]);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('mousedown', onClickOutside);
    return () => window.removeEventListener('mousedown', onClickOutside);
  }, []);

  const submitRaw = useCallback(
    (q: string) => {
      const trimmed = q.trim();
      if (!trimmed) return;
      logEvent('search.submit', { q: trimmed });
      router.push(`/search?q=${encodeURIComponent(trimmed)}`);
      setOpen(false);
    },
    [router],
  );

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (!open || rows.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % rows.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + rows.length) % rows.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const row = rows[activeIndex];
      if (!row) {
        submitRaw(value);
        return;
      }
      if (row.type === 'see-all') {
        submitRaw(debouncedQuery);
        return;
      }
      // delegate to next click handler via simulated event — just navigate directly:
      if (row.type === 'tag') {
        const slug = row.id.replace(/^tag-/, '');
        router.push(`/search?tags=${encodeURIComponent(slug)}`);
      } else if (row.type === 'asset') {
        const id = row.id.replace(/^asset-/, '');
        const hit = assetsQ.data?.hits.find((h) => h.id === id);
        if (hit) router.push(`/assets/${hit.slug}`);
      }
      setOpen(false);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    submitRaw(value);
  };

  const showPanel = open && debouncedQuery.length > 1;

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {/* Mobile: collapsed icon link */}
      <a
        href="/search"
        aria-label={t('search')}
        className="lg:hidden inline-flex h-10 w-10 items-center justify-center rounded-[12px] text-ink-2 hover:bg-surface-muted hover:text-ink transition-colors duration-120 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
      >
        <Search className="h-5 w-5" strokeWidth={2.25} />
      </a>

      {/* Desktop: inline input */}
      <form role="search" onSubmit={onSubmit} className="hidden lg:flex relative w-[300px]">
        <Input
          ref={inputRef}
          inputSize="sm"
          type="search"
          name="q"
          aria-label={t('search')}
          placeholder={t('searchPlaceholder')}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setOpen(true);
          }}
          onFocus={() => value && setOpen(true)}
          onKeyDown={onKey}
          aria-expanded={showPanel}
          aria-controls="search-typeahead"
          aria-activedescendant={rows[activeIndex]?.id}
          autoComplete="off"
          leadingIcon={
            isFetching ? (
              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.25} />
            ) : (
              <Search className="h-4 w-4" strokeWidth={2.25} />
            )
          }
          className="bg-surface-muted border-transparent focus-visible:bg-surface focus-visible:border-line-strong"
        />

        {showPanel ? (
          <div
            id="search-typeahead"
            role="listbox"
            className="absolute top-full mt-2 left-0 right-0 z-50 rounded-[14px] border border-line bg-surface shadow-2 overflow-hidden"
          >
            {rows.length === 0 && !isFetching ? (
              <div className="p-4 text-body-sm text-ink-3">{tNav('noMatches')}</div>
            ) : (
              <>
                {(tagsQ.data?.length ?? 0) > 0 ? (
                  <div className="px-3 pt-2.5 pb-1">
                    <p className="text-eyebrow uppercase tracking-[0.12em] text-ink-3">
                      {tNav('tags')}
                    </p>
                  </div>
                ) : null}
                {tagsQ.data?.map((tag, i) => {
                  const rowIndex = i;
                  const active = rows[activeIndex]?.id === `tag-${tag.slug}`;
                  return (
                    <NextLink
                      key={tag.slug}
                      href={`/search?tags=${encodeURIComponent(tag.slug)}`}
                      id={`tag-${tag.slug}`}
                      role="option"
                      aria-selected={active}
                      onMouseEnter={() => setActiveIndex(rowIndex)}
                      onClick={() => setOpen(false)}
                      className={cn(
                        'flex items-center gap-2.5 px-3 h-9 text-[13.5px] text-ink hover:bg-surface-muted/60 transition-colors duration-120',
                        active && 'bg-surface-muted/60',
                      )}
                    >
                      <TagIcon className="h-3.5 w-3.5 text-ink-3" strokeWidth={2.25} />
                      <span className="font-medium">{tag.displayName}</span>
                      <span className="ml-auto text-caption text-ink-3 geist-tnum">
                        {tag.usageCount}
                      </span>
                    </NextLink>
                  );
                })}

                {(assetsQ.data?.hits?.length ?? 0) > 0 ? (
                  <div className="px-3 pt-2.5 pb-1 border-t border-line">
                    <p className="text-eyebrow uppercase tracking-[0.12em] text-ink-3">
                      {tNav('assets')}
                    </p>
                  </div>
                ) : null}
                {assetsQ.data?.hits?.map((hit, i) => {
                  const rowIndex = (tagsQ.data?.length ?? 0) + i;
                  const active = rows[activeIndex]?.id === `asset-${hit.id}`;
                  return (
                    <NextLink
                      key={hit.id}
                      href={`/assets/${hit.slug}`}
                      id={`asset-${hit.id}`}
                      role="option"
                      aria-selected={active}
                      onMouseEnter={() => setActiveIndex(rowIndex)}
                      onClick={() => setOpen(false)}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2 hover:bg-surface-muted/60 transition-colors duration-120',
                        active && 'bg-surface-muted/60',
                      )}
                    >
                      <div className="relative h-10 w-[60px] shrink-0 rounded-[8px] overflow-hidden bg-surface-muted border border-line">
                        {hit.thumbnailUrl ? (
                          <Image
                            src={hit.thumbnailUrl}
                            alt=""
                            fill
                            sizes="60px"
                            className="object-cover"
                            unoptimized
                          />
                        ) : null}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[13.5px] font-medium text-ink truncate">{hit.title}</p>
                        <p className="text-caption text-ink-3 truncate">{hit.categoryName}</p>
                      </div>
                    </NextLink>
                  );
                })}

                <button
                  type="button"
                  id="see-all"
                  role="option"
                  aria-selected={rows[activeIndex]?.id === 'see-all'}
                  onMouseEnter={() => setActiveIndex(rows.length - 1)}
                  onClick={() => submitRaw(debouncedQuery)}
                  className={cn(
                    'flex items-center justify-between gap-2 w-full px-3 h-10 text-[13px] font-medium text-brand-blue hover:bg-brand-blue-50/60 border-t border-line text-left transition-colors duration-120',
                    rows[activeIndex]?.id === 'see-all' && 'bg-brand-blue-50/60',
                  )}
                >
                  <span>{tNav('seeAllFor', { query: debouncedQuery })}</span>
                  <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.25} />
                </button>
              </>
            )}
          </div>
        ) : null}
      </form>
    </div>
  );
}

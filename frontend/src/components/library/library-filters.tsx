'use client';

import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import { FilterSection, ChipFilter } from '@/components/filters/filter-section';
import { TagCombobox } from '@/components/filters/tag-combobox';
import { useAuthedFetch } from '@/lib/api/client';
import { queryKeys, STALE_TIMES } from '@/lib/api/queries';
import { useUrlState } from '@/lib/hooks/use-url-state';
import type { Category, Engine, LibrarySort, LocaleCode } from '@/lib/api/types';

const ENGINES: { label: string; value: Engine | '' }[] = [
  { label: 'Any', value: '' },
  { label: 'Unity', value: 'UNITY' },
  { label: 'Unreal', value: 'UNREAL' },
  { label: 'Engine-agnostic', value: 'ENGINE_AGNOSTIC' },
];

const HIDDEN: { label: string; value: 'false' | 'true' | 'all' }[] = [
  { label: 'Visible', value: 'false' },
  { label: 'Hidden', value: 'true' },
  { label: 'All', value: 'all' },
];

const SORTS: LibrarySort[] = ['savedAt', 'alphabetical', 'recentlyUpdated'];

export function LibraryFilters() {
  const t = useTranslations('library.filters');
  const fetcher = useAuthedFetch();
  const locale = useLocale() as LocaleCode;
  const { get, getAll, setParams, reset } = useUrlState();

  const categoriesQuery = useQuery({
    queryKey: queryKeys.categories(locale),
    queryFn: () => fetcher<Category[]>('/categories', { query: { locale } }),
    staleTime: STALE_TIMES.categories,
  });

  const q = get('q') ?? '';
  const engine = get('engine') ?? '';
  const categoryIds = getAll('categoryIds');
  const tags = getAll('tags');
  const hidden = (get('hidden') ?? 'false') as 'false' | 'true' | 'all';
  const sort = (get('sort') as LibrarySort | null) ?? 'savedAt';

  const activeCount =
    (q ? 1 : 0) +
    (engine ? 1 : 0) +
    categoryIds.length +
    tags.length +
    (hidden !== 'false' ? 1 : 0);

  return (
    <aside className="lg:sticky lg:top-24 lg:self-start lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto pr-1">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-h4 font-semibold text-ink">{t('title')}</h2>
        {activeCount > 0 ? (
          <button
            type="button"
            onClick={reset}
            className="text-caption text-brand-blue hover:underline"
          >
            Clear
          </button>
        ) : null}
      </div>

      <FilterSection title={t('search')} activeCount={q ? 1 : 0}>
        <Input
          inputSize="sm"
          value={q}
          onChange={(e) => setParams({ q: e.target.value || null, cursor: null })}
          placeholder={t('searchPlaceholder')}
        />
      </FilterSection>

      <FilterSection title={t('engine')} activeCount={engine ? 1 : 0}>
        <div className="flex flex-col gap-1.5">
          {ENGINES.map((e) => (
            <label
              key={e.value || 'any'}
              className="inline-flex items-center gap-2.5 text-[13.5px] text-ink cursor-pointer"
            >
              <input
                type="radio"
                name="library-engine"
                checked={engine === e.value}
                onChange={() => setParams({ engine: e.value || null })}
                className="h-4 w-4 accent-ink"
              />
              {e.label}
            </label>
          ))}
        </div>
      </FilterSection>

      <FilterSection title={t('category')} activeCount={categoryIds.length}>
        <ChipFilter
          options={(categoriesQuery.data ?? []).map((c) => ({ label: c.name, value: c.id }))}
          values={categoryIds}
          onChange={(next) => setParams({ categoryIds: next })}
        />
      </FilterSection>

      <FilterSection title={t('tags')} activeCount={tags.length}>
        <TagCombobox
          values={tags}
          onChange={(next) => setParams({ tags: next })}
          placeholder="Type to add a tag"
        />
      </FilterSection>

      <FilterSection title={t('hidden')} activeCount={hidden !== 'false' ? 1 : 0}>
        <div className="flex flex-col gap-1.5">
          {HIDDEN.map((h) => (
            <label
              key={h.value}
              className="inline-flex items-center gap-2.5 text-[13.5px] text-ink cursor-pointer"
            >
              <input
                type="radio"
                name="library-hidden"
                checked={hidden === h.value}
                onChange={() => setParams({ hidden: h.value === 'false' ? null : h.value })}
                className="h-4 w-4 accent-ink"
              />
              {h.value === 'true'
                ? t('hiddenHidden')
                : h.value === 'all'
                  ? t('hiddenAll')
                  : t('hiddenVisible')}
            </label>
          ))}
        </div>
      </FilterSection>

      <FilterSection title={t('sort')} defaultOpen>
        <select
          value={sort}
          onChange={(e) => setParams({ sort: e.target.value === 'savedAt' ? null : e.target.value })}
          className="w-full h-10 rounded-[10px] border border-line bg-surface text-[13.5px] text-ink px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
        >
          {SORTS.map((s) => (
            <option key={s} value={s}>
              {t(
                s === 'savedAt'
                  ? 'sortSavedAt'
                  : s === 'alphabetical'
                    ? 'sortAlphabetical'
                    : 'sortRecentlyUpdated',
              )}
            </option>
          ))}
        </select>
      </FilterSection>
    </aside>
  );
}

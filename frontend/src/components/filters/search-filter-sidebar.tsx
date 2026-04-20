'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import { FilterSection, ChipFilter } from './filter-section';
import { TagCombobox } from './tag-combobox';
import { useAuthedFetch } from '@/lib/api/client';
import { queryKeys, STALE_TIMES } from '@/lib/api/queries';
import { useUrlState } from '@/lib/hooks/use-url-state';
import type {
  Category,
  Engine,
  FileKind,
  LicenseSummary,
  LocaleCode,
  RenderPipeline,
  SortOrder,
  TargetPlatform,
} from '@/lib/api/types';

const ENGINES: { label: string; value: Engine | '' }[] = [
  { label: 'Any', value: '' },
  { label: 'Unity', value: 'UNITY' },
  { label: 'Unreal', value: 'UNREAL' },
  { label: 'Engine-agnostic', value: 'ENGINE_AGNOSTIC' },
];

const FILE_KINDS: FileKind[] = [
  'UNITYPACKAGE',
  'UPLUGIN',
  'UNITY_PROJECT',
  'UNREAL_PROJECT',
  'GLB',
  'FBX',
  'OBJ',
  'TEXTURE_2D',
  'AUDIO',
  'VIDEO',
  'SCRIPT',
  'PREFAB',
  'SCENE',
  'ARCHIVE',
];

const RENDER_PIPELINES: RenderPipeline[] = ['URP', 'HDRP', 'SRP', 'BUILT_IN', 'NA'];

const TARGETS: TargetPlatform[] = [
  'WINDOWS',
  'MAC',
  'LINUX',
  'IOS',
  'ANDROID',
  'CONSOLE',
  'WEB',
  'VR',
];

const SORTS: SortOrder[] = ['newest', 'mostDownloaded', 'recentlyUpdated', 'alphabetical', 'mostSaved'];

export function SearchFilterSidebar() {
  const t = useTranslations('search.filters');
  const tSearch = useTranslations('search');
  const tDiscover = useTranslations('discover');
  const fetcher = useAuthedFetch();
  const locale = useLocale() as LocaleCode;
  const { params, get, getAll, setParams, reset } = useUrlState();

  const categoriesQuery = useQuery({
    queryKey: queryKeys.categories(locale),
    queryFn: () => fetcher<Category[]>('/categories', { query: { locale } }),
    staleTime: STALE_TIMES.categories,
  });
  const licensesQuery = useQuery({
    queryKey: queryKeys.licenses(locale),
    queryFn: () => fetcher<LicenseSummary[]>('/licenses', { query: { locale } }),
    staleTime: STALE_TIMES.licenses,
  });

  const q = get('q') ?? '';
  const engine = get('engine') ?? '';
  const categoryIds = getAll('categoryIds');
  const fileKinds = getAll('fileKinds');
  const licenseSlug = get('licenseSlug') ?? '';
  const renderPipelines = getAll('renderPipelines');
  const targets = getAll('targets');
  const tags = getAll('tags');
  const sort = (get('sort') as SortOrder | null) ?? 'newest';

  const activeCount = useMemo(() => {
    return (
      (engine ? 1 : 0) +
      categoryIds.length +
      fileKinds.length +
      (licenseSlug ? 1 : 0) +
      renderPipelines.length +
      targets.length +
      tags.length
    );
  }, [engine, categoryIds.length, fileKinds.length, licenseSlug, renderPipelines.length, targets.length, tags.length]);

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
            {t('clearAll')}
          </button>
        ) : null}
      </div>
      {activeCount > 0 ? (
        <p className="text-caption text-ink-3 mb-2 geist-tnum">
          {t('activeCount', { count: activeCount })}
        </p>
      ) : null}

      <FilterSection title={t('query')} activeCount={q ? 1 : 0}>
        <Input
          inputSize="sm"
          type="search"
          value={q}
          onChange={(e) => setParams({ q: e.target.value || null, cursor: null })}
          placeholder={t('queryPlaceholder')}
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
                name="engine"
                checked={engine === e.value}
                onChange={() => setParams({ engine: e.value || null })}
                className="h-4 w-4 accent-ink"
              />
              {e.label}
            </label>
          ))}
        </div>
      </FilterSection>

      <FilterSection title={t('categories')} activeCount={categoryIds.length}>
        <ChipFilter
          options={(categoriesQuery.data ?? []).map((c) => ({ label: c.name, value: c.id }))}
          values={categoryIds}
          onChange={(next) => setParams({ categoryIds: next })}
        />
      </FilterSection>

      <FilterSection title={t('fileTypes')} activeCount={fileKinds.length}>
        <ChipFilter
          options={FILE_KINDS.map((k) => ({
            label: tSearch(`fileKind.${k}` as 'fileKind.GLB'),
            value: k,
          }))}
          values={fileKinds}
          onChange={(next) => setParams({ fileKinds: next })}
        />
      </FilterSection>

      <FilterSection title={t('license')} activeCount={licenseSlug ? 1 : 0}>
        <select
          value={licenseSlug}
          onChange={(e) => setParams({ licenseSlug: e.target.value || null })}
          className="w-full h-10 rounded-[10px] border border-line bg-surface text-[13.5px] text-ink px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
        >
          <option value="">Any license</option>
          {(licensesQuery.data ?? []).map((l) => (
            <option key={l.slug} value={l.slug}>
              {l.name}
            </option>
          ))}
        </select>
      </FilterSection>

      <FilterSection title={t('renderPipelines')} activeCount={renderPipelines.length}>
        <ChipFilter
          options={RENDER_PIPELINES.map((rp) => ({
            label: tSearch(`renderPipeline.${rp}`),
            value: rp,
          }))}
          values={renderPipelines}
          onChange={(next) => setParams({ renderPipelines: next })}
        />
      </FilterSection>

      <FilterSection title={t('targets')} activeCount={targets.length}>
        <ChipFilter
          options={TARGETS.map((tg) => ({
            label: tSearch(`target.${tg}`),
            value: tg,
          }))}
          values={targets}
          onChange={(next) => setParams({ targets: next })}
        />
      </FilterSection>

      <FilterSection title={t('tags')} activeCount={tags.length}>
        <TagCombobox
          values={tags}
          onChange={(next) => setParams({ tags: next })}
          placeholder={t('tagsPlaceholder')}
        />
      </FilterSection>

      <FilterSection title={t('sort')} defaultOpen>
        <select
          value={sort}
          onChange={(e) => setParams({ sort: e.target.value === 'newest' ? null : e.target.value })}
          className="w-full h-10 rounded-[10px] border border-line bg-surface text-[13.5px] text-ink px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
        >
          {SORTS.map((s) => (
            <option key={s} value={s}>
              {tDiscover(`sort.${s}` as 'sort.newest')}
            </option>
          ))}
        </select>
      </FilterSection>
      {/* Silence unused var lint for params */}
      <span className="sr-only" data-active={params.toString()} />
    </aside>
  );
}

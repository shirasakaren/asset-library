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

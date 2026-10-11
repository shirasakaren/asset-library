import { beforeEach, describe, expect, it, vi } from 'vitest';

const seed = vi.hoisted(() => ({ docs: [] as unknown[] }));

vi.mock('@/preview/seed-data/assets.json', () => ({
  get default() {
    return seed.docs;
  },
}));
vi.mock('@/components/publish/publish-wizard-page-client', () => ({
  PublishWizardPageClient: () => null,
}));
vi.mock('@/components/publish/new-version-page-client', () => ({
  NewVersionPageClient: () => null,
}));
vi.mock('@/components/publish/analytics-page-client', () => ({
  AnalyticsPageClient: () => null,
}));

import { seededIdParams } from '@/lib/static-params';
import { generateStaticParams as wizardParams } from '@/app/(app)/publish/[id]/page';
import { generateStaticParams as newVersionParams } from '@/app/(app)/publish/[id]/versions/new/page';
import { generateStaticParams as analyticsParams } from '@/app/(app)/publish/manage/[id]/analytics/page';

describe('seededIdParams', () => {
  it('falls back to a placeholder for an empty list', () => {
    expect(seededIdParams([])).toEqual([{ id: '_placeholder' }]);
  });

  it('maps each document to its id', () => {
    expect(seededIdParams([{ id: 'a1' }, { id: 'a2' }])).toEqual([{ id: 'a1' }, { id: 'a2' }]);
  });
});

describe.each([
  ['publish/[id]', wizardParams],
  ['publish/[id]/versions/new', newVersionParams],
  ['publish/manage/[id]/analytics', analyticsParams],
])('%s generateStaticParams', (_route, generate) => {
  beforeEach(() => {
    seed.docs = [];
  });

  it('emits a placeholder so the export build passes with an empty seed', () => {
    expect(generate()).toEqual([{ id: '_placeholder' }]);
  });

  it('emits one param per seeded asset id', () => {
    seed.docs = [
      { id: 'a1', slug: 'first' },
      { id: 'a2', slug: 'second' },
    ];
    expect(generate()).toEqual([{ id: 'a1' }, { id: 'a2' }]);
  });
});

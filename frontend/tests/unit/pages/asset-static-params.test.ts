import { beforeEach, describe, expect, it, vi } from 'vitest';

const seed = vi.hoisted(() => ({ docs: [] as unknown[] }));

vi.mock('@/preview/seed-data/assets.json', () => ({
  get default() {
    return seed.docs;
  },
}));
vi.mock('@/components/asset/asset-detail-page-client', () => ({
  AssetDetailPageClient: () => null,
}));

import { generateStaticParams } from '@/app/(app)/assets/[idOrSlug]/page';

describe('assets/[idOrSlug] generateStaticParams', () => {
  beforeEach(() => {
    seed.docs = [];
  });

  it('falls back to a placeholder so the export build passes with an empty seed', () => {
    expect(generateStaticParams()).toEqual([{ idOrSlug: '_placeholder' }]);
  });

  it('emits one param per seeded asset, preferring slug and falling back to id', () => {
    seed.docs = [{ id: 'a1', slug: 'first' }, { id: 'a2' }];
    expect(generateStaticParams()).toEqual([{ idOrSlug: 'first' }, { idOrSlug: 'a2' }]);
  });
});

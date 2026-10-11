import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { getDb, previewFetch, resetDemo } from '@/preview';
import { getBlobStore } from '@/preview/uploads/blob-store';
import { createIdbOverlay } from '@/preview/store/overlay';
import type { AssetListPage, Category, LicenseSummary } from '@/lib/api/types';

const mineQuery = { ownerId: 'u-persona', includeUnpublished: 'true', limit: 100 };

describe('resetDemo (real Db over fake IndexedDB, real seed)', () => {
  it('drops everything the visitor created: records, overlay rows and uploaded blobs', async () => {
    const [cats, licenses] = await Promise.all([
      previewFetch<Category[]>('/categories'),
      previewFetch<LicenseSummary[]>('/licenses'),
    ]);
    const before = await previewFetch<AssetListPage>('/assets', { query: mineQuery });

    const created = await previewFetch<{ id: string }>('/assets', {
      method: 'POST',
      body: {
        title: 'Reset Integration Draft',
        engine: 'UNITY',
        categoryId: cats[0]!.id,
        licenseId: licenses[0]!.id,
        semver: '0.1.0',
        translations: [
          { locale: 'en', shortDescription: '', longDescription: { type: 'doc', content: [] } },
        ],
      },
    });
    await getBlobStore().put('up-integration', new Blob(['payload']));

    const during = await previewFetch<AssetListPage>('/assets', { query: mineQuery });
    expect(during.items.some((a) => a.id === created.id)).toBe(true);
    expect(during.items.length).toBe(before.items.length + 1);
    const overlay = createIdbOverlay();
    await overlay.open();
    expect((await overlay.all()).size).toBeGreaterThan(0);
    expect((await getBlobStore().list()).length).toBe(1);

    await resetDemo();

    const after = await previewFetch<AssetListPage>('/assets', { query: mineQuery });
    expect(after.items.some((a) => a.id === created.id)).toBe(false);
    expect(after.items.map((a) => a.id).sort()).toEqual(before.items.map((a) => a.id).sort());
    expect((await overlay.all()).size).toBe(0);
    expect(await getBlobStore().list()).toEqual([]);
    // the same singleton keeps working after the reset (the app reloads, but must not break first)
    expect((await getDb()).persistent).toBe(true);
  });
});

import { describe, it, expect } from 'vitest';
import { createSeededTestApp } from '@/preview/test-utils';
import type { AssetDetail, AssetListPage } from '@/lib/api/types';

describe('AssetDetail store link fields', () => {
  it('seeded listings carry storeName and an https storeUrl', async () => {
    const app = await createSeededTestApp();
    const page = await app.call<AssetListPage>('GET', '/assets', { query: { limit: 10 } });
    expect(page.items.length).toBeGreaterThan(0);
    for (const item of page.items) {
      const d = await app.call<AssetDetail>('GET', `/assets/${item.id}`);
      expect(d.storeName).toBeTruthy();
      expect(d.storeUrl).toMatch(/^https:\/\//);
    }
  });

  it('user-created assets have neither field', async () => {
    const app = await createSeededTestApp();
    const cats = await app.call<{ id: string }[]>('GET', '/categories');
    const licenses = await app.call<{ id: string }[]>('GET', '/licenses');
    const created = await app.call<{ id: string }>('POST', '/assets', {
      body: {
        title: 'My own thing',
        engine: 'UNITY',
        categoryId: cats[0]!.id,
        licenseId: licenses[0]!.id,
        semver: '0.1.0',
        translations: [
          { locale: 'en', shortDescription: '', longDescription: { type: 'doc', content: [] } },
        ],
      },
    });
    const d = await app.call<AssetDetail>('GET', `/assets/${created.id}`);
    expect(d.storeName).toBeUndefined();
    expect(d.storeUrl).toBeUndefined();
  });
});

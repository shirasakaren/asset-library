import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSeedSource } from '@/preview/store/seed-source';
import type { Doc } from '@/preview/types';

afterEach(() => {
  vi.unstubAllEnvs();
});

type Thumbed = Doc & { thumbnail: { url: string }; thumbnailSmall: string };

describe('createSeedSource with a base path', () => {
  it('serves the real seed with every /thumbs/ URL under the base path', async () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_PATH', '/asset-library');
    const assets = (await createSeedSource().load('assets')) as Thumbed[];
    expect(assets.length).toBeGreaterThan(100);
    for (const a of assets) {
      expect(a.thumbnail.url).toMatch(/^\/asset-library\/thumbs\/.+\.webp$/);
      expect(a.thumbnailSmall).toMatch(/^\/asset-library\/thumbs\/.+-sm\.webp$/);
    }
    // No string anywhere in the collection still points at the bare /thumbs/ root.
    expect(JSON.stringify(assets)).not.toMatch(/"\/thumbs\//);
  });

  it('prefixes the featured banners too', async () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_PATH', '/asset-library');
    const featured = await createSeedSource().load('featured');
    expect(JSON.stringify(featured)).not.toMatch(/"\/thumbs\//);
    expect(JSON.stringify(featured)).toMatch(/"\/asset-library\/thumbs\//);
  });

  it('is unchanged at the domain root', async () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_PATH', '');
    const assets = (await createSeedSource().load('assets')) as Thumbed[];
    expect(assets[0]!.thumbnail.url).toMatch(/^\/thumbs\//);
    expect(JSON.stringify(assets)).not.toMatch(/asset-library/);
  });
});

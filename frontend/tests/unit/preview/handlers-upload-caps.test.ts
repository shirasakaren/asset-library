import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiError } from '@/lib/api/errors';
import type { AssetSummary, DiscoverResponse } from '@/lib/api/types';
import type { AssetRecord } from '@/preview/records';
import { putWithProgress } from '@/lib/upload/put-with-progress';
import { getBlobStore } from '@/preview/uploads/blob-store';
import { appForWrites, status, storedOrThrow, type App } from './publish-fixtures';

/** Image size caps (data URLs live inside records), see `src/lib/upload/image-caps.ts`. */
const KB = 1024;
const MB = 1024 * KB;

const thumbInit = (app: App, body: unknown) =>
  app.call<{ putUrl: string; key: string }>('POST', '/files/thumbnails/initiate', { body });
const edInit = (app: App, body: unknown) =>
  app.call<{ putUrl: string; key: string }>('POST', '/files/editor-media/initiate', { body });
const bannerInit = (app: App, body: unknown) =>
  app.call('POST', '/admin/featured/banner-uploads/initiate', { body });
const iconInit = (app: App, body: unknown) =>
  app.call('POST', '/admin/categories/icon-uploads/initiate', { body });

async function tooLarge(p: Promise<unknown>) {
  const err = (await p.then(
    () => null,
    (e: unknown) => e,
  )) as ApiError | null;
  expect(err, 'expected a rejection').not.toBeNull();
  expect(err!.status).toBe(400);
  expect(err!.fields?.[0]).toMatchObject({ code: 'too_large' });
  // readable: says what is too big and what the limit is
  expect(err!.message).toMatch(/MB|KB/);
}

beforeEach(async () => {
  await getBlobStore().clear();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});
afterEach(() => vi.useRealTimers());

describe('thumbnail cap (1 MB)', () => {
  it('accepts exactly 1 MB and refuses one byte more', async () => {
    const app = await appForWrites({ timers: false });
    const body = (bytes: number) => ({ assetId: 'a-mine-draft', contentType: 'image/webp', bytes });
    expect(await thumbInit(app, body(MB))).toBeDefined();
    await tooLarge(thumbInit(app, body(MB + 1)));
    await tooLarge(thumbInit(app, body(3 * MB)));
  });

  it('complete refuses bytes that are bigger than the cap even if initiate was told less', async () => {
    const app = await appForWrites({ timers: false });
    const ini = await thumbInit(app, {
      assetId: 'a-mine-draft',
      contentType: 'image/png',
      bytes: 10,
    });
    const p = putWithProgress({
      url: ini.putUrl,
      body: new Blob([new Uint8Array(MB + 1)], { type: 'image/png' }),
      contentType: 'image/png',
    });
    await vi.advanceTimersByTimeAsync(700);
    await p;
    await tooLarge(
      app.call('POST', '/files/thumbnails/complete', {
        body: { assetId: 'a-mine-draft', key: ini.key },
      }),
    );
    expect((await storedOrThrow(app, 'a-mine-draft')).thumbnail.url).not.toMatch(/^data:/);
  });
});

describe('featured banner cap (1 MB) and category icon cap (256 KB)', () => {
  it('banner: 1 MB passes, one byte more is too_large', async () => {
    const app = await appForWrites({ timers: false });
    expect(await bannerInit(app, { contentType: 'image/gif', bytes: MB })).toBeDefined();
    await tooLarge(bannerInit(app, { contentType: 'image/gif', bytes: MB + 1 }));
  });

  it('icon: 256 KB passes, one byte more is too_large', async () => {
    const app = await appForWrites({ timers: false });
    expect(await iconInit(app, { contentType: 'image/png', bytes: 256 * KB })).toBeDefined();
    await tooLarge(iconInit(app, { contentType: 'image/png', bytes: 256 * KB + 1 }));
  });
});

describe('editor media / preview media caps', () => {
  it('images: 2 MB without a purpose (embeds and originals), 1.5 MB for a display copy', async () => {
    const app = await appForWrites({ timers: false });
    expect(await edInit(app, { contentType: 'image/png', bytes: 2 * MB })).toBeDefined();
    await tooLarge(edInit(app, { contentType: 'image/png', bytes: 2 * MB + 1 }));
    expect(
      await edInit(app, { contentType: 'image/webp', bytes: 1.5 * MB, purpose: 'display' }),
    ).toBeDefined();
    await tooLarge(
      edInit(app, { contentType: 'image/webp', bytes: 1.5 * MB + 1, purpose: 'display' }),
    );
    await tooLarge(edInit(app, { contentType: 'image/gif', bytes: 3 * MB, purpose: 'original' }));
  });

  it('rejects an unknown purpose', async () => {
    const app = await appForWrites({ timers: false });
    await expect(
      edInit(app, { contentType: 'image/png', bytes: 10, purpose: 'nope' }),
    ).rejects.toSatisfy(status(400));
  });

  it('video, audio and 3D keep the 5 MB blob limit', async () => {
    const app = await appForWrites({ timers: false });
    expect(await edInit(app, { contentType: 'video/mp4', bytes: 5 * MB })).toBeDefined();
    await expect(edInit(app, { contentType: 'video/mp4', bytes: 5 * MB + 1 })).rejects.toSatisfy(
      status(400),
    );
  });
});

describe('payload sizes', () => {
  const dataUrl = (bytes: number) =>
    `data:image/webp;base64,${'A'.repeat(Math.ceil((bytes * 4) / 3))}`;

  it('an asset with a 1 MB thumbnail makes a summary of < 1.4 MB + overhead, nothing else big', async () => {
    const app = await appForWrites({ timers: false });
    const thumb = dataUrl(MB);
    await app.db.patch<AssetRecord>('assets', 'a-fx-001', {
      thumbnail: { key: 'thumbs/x', url: thumb },
      previewMedia: [
        {
          id: 'pm-1',
          kind: 'image',
          key: 'editor/u/o',
          viewUrl: dataUrl(1.5 * MB),
          originalUrl: dataUrl(2 * MB),
          visibility: 'visible',
        } as AssetRecord['previewMedia'][number],
      ],
    });
    const page = await app.call<{ items: AssetSummary[] }>('GET', '/assets');
    const one = page.items.find((i) => i.id === 'a-fx-001')!;
    expect(one.thumbnailUrl).toBe(thumb);
    const bytes = JSON.stringify(one).length;
    expect(bytes).toBeLessThan(1.4 * MB + 20 * KB);
    expect(JSON.stringify(one)).not.toContain('originalUrl');
  });

  it('/discover does not grow when an asset gains preview media with originals', async () => {
    const app = await appForWrites({ timers: false });
    const before = JSON.stringify(await app.call<DiscoverResponse>('GET', '/discover')).length;
    await app.db.patch<AssetRecord>('assets', 'a-fx-001', {
      previewMedia: [
        {
          id: 'pm-1',
          kind: 'image',
          key: 'editor/u/o',
          viewUrl: dataUrl(1.5 * MB),
          originalUrl: dataUrl(2 * MB),
          visibility: 'visible',
        } as AssetRecord['previewMedia'][number],
      ],
    });
    const after = JSON.stringify(await app.call<DiscoverResponse>('GET', '/discover')).length;
    expect(after).toBe(before);
  });
});

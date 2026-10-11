import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { uploadEditorMedia } from '@/components/rich-text/editor-media-upload';
import { previewFetch, resetDemo } from '@/preview';

describe('uploadEditorMedia against the preview handlers', () => {
  beforeEach(async () => {
    await resetDemo();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });
  afterEach(() => vi.useRealTimers());

  it('returns a persistable data URL and a key that refreshes to the same URL', async () => {
    const file = new File([new Uint8Array([71, 73, 70])], 'a.gif', { type: 'image/gif' });
    const progress: number[] = [];
    const p = uploadEditorMedia(file, undefined, { onProgress: (l) => progress.push(l) });
    // initiate is real async work; keep ticking until the simulated PUT finishes
    await vi.waitFor(async () => {
      await vi.advanceTimersByTimeAsync(200);
      expect(progress[progress.length - 1]).toBe(3);
    });
    const { viewUrl, key } = await p;
    expect(viewUrl).toBe(`data:image/gif;base64,${btoa('GIF')}`);
    expect(key.startsWith('editor/')).toBe(true);
    const again = await previewFetch<{ viewUrl: string }>('/files/editor-media/refresh', {
      method: 'POST',
      body: { key },
    });
    expect(again.viewUrl).toBe(viewUrl);
  });

  it('sends the purpose hint and surfaces the readable 400 for an oversized display copy', async () => {
    const big = new File([new Uint8Array(1.5 * 1024 * 1024 + 1)], 'big.webp', {
      type: 'image/webp',
    });
    await expect(uploadEditorMedia(big, undefined, { purpose: 'display' })).rejects.toThrow(
      /preview image is 1.5 MB.*up to 1.5 MB/,
    );
    // the same file is fine as an original (cap 2 MB)
    await previewFetch('/files/editor-media/initiate', {
      method: 'POST',
      body: { contentType: 'image/webp', bytes: big.size, purpose: 'original' },
    });
  });
});

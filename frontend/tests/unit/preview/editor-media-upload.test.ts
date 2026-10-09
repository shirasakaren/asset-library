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
});

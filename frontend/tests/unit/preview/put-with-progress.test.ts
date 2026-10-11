import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { putWithProgress, PREVIEW_URL_SCHEME } from '@/lib/upload/put-with-progress';
import { BLOB_STORE_MAX_BYTES, getBlobStore } from '@/preview/uploads/blob-store';

describe('putWithProgress with preview:// URLs', () => {
  beforeEach(async () => {
    // The singleton store keeps its connection; open and empty it on real timers first.
    await getBlobStore().clear();
    // fake-indexeddb schedules with setImmediate, so only the timers the code under test uses are faked.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const file = (n: number) =>
    new File([new Uint8Array(n).fill(1)], 'a.bin', { type: 'application/octet-stream' });

  it('uses the preview scheme constant', () => {
    expect(PREVIEW_URL_SCHEME).toBe('preview://');
  });

  it('never touches XMLHttpRequest, ticks at least 6 times over ~600 ms and stores the blob', async () => {
    const xhr = vi.fn(() => {
      throw new Error('XHR must not be used');
    });
    vi.stubGlobal('XMLHttpRequest', xhr);
    const ticks: Array<[number, number]> = [];
    let done = false;
    const p = putWithProgress({
      url: 'preview://up_1',
      body: file(1000),
      contentType: 'application/octet-stream',
      onProgress: (l, t) => ticks.push([l, t]),
    }).then(() => {
      done = true;
    });

    await vi.advanceTimersByTimeAsync(300);
    expect(done).toBe(false);
    expect(ticks.length).toBeGreaterThanOrEqual(2);
    await vi.advanceTimersByTimeAsync(400);
    await p;

    expect(xhr).not.toHaveBeenCalled();
    expect(ticks.length).toBeGreaterThanOrEqual(6);
    expect(ticks.every(([, t]) => t === 1000)).toBe(true);
    const loaded = ticks.map(([l]) => l);
    expect([...loaded].sort((a, b) => a - b)).toEqual(loaded);
    expect(loaded[loaded.length - 1]).toBe(1000);

    const entry = await getBlobStore().get('up_1');
    expect(entry).toMatchObject({ size: 1000, stored: true, type: 'application/octet-stream' });
  });

  it('takes about 600 ms whatever the size and keeps only metadata over 5 MB', async () => {
    const big = file(BLOB_STORE_MAX_BYTES + 10);
    let done = false;
    const p = putWithProgress({
      url: 'preview://up_big',
      body: big,
      contentType: 'application/zip',
    }).then(() => {
      done = true;
    });
    await vi.advanceTimersByTimeAsync(650);
    await p;
    expect(done).toBe(true);
    expect(await getBlobStore().get('up_big')).toMatchObject({
      size: BLOB_STORE_MAX_BYTES + 10,
      stored: false,
      blob: null,
    });
  });

  it('keys multipart parts by <uploadId>/part/<n>', async () => {
    const p = putWithProgress({
      url: 'preview://up_m/part/2',
      body: file(10),
      contentType: 'application/octet-stream',
    });
    await vi.advanceTimersByTimeAsync(700);
    await p;
    expect((await getBlobStore().get('up_m/part/2'))?.size).toBe(10);
  });

  it('rejects with an AbortError when aborted before it starts', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    const err = await putWithProgress({
      url: 'preview://up_a',
      body: file(5),
      contentType: 'x/y',
      signal: ctrl.signal,
    }).catch((e) => e);
    expect(err).toBeInstanceOf(DOMException);
    expect(err.name).toBe('AbortError');
    expect(await getBlobStore().get('up_a')).toBeUndefined();
  });

  it('rejects with an AbortError when aborted midway and stores nothing', async () => {
    const ctrl = new AbortController();
    const seen: number[] = [];
    const p = putWithProgress({
      url: 'preview://up_b',
      body: file(50),
      contentType: 'x/y',
      signal: ctrl.signal,
      onProgress: (l) => seen.push(l),
    }).catch((e) => e);
    await vi.advanceTimersByTimeAsync(250);
    ctrl.abort();
    const err = await p;
    expect(err.name).toBe('AbortError');
    const count = seen.length;
    await vi.advanceTimersByTimeAsync(1000);
    expect(seen.length).toBe(count); // timer stopped
    expect(await getBlobStore().get('up_b')).toBeUndefined();
  });
});

describe('putWithProgress with http URLs', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('still uses XMLHttpRequest', async () => {
    const instances: FakeXhr[] = [];
    class FakeXhr {
      status = 200;
      statusText = 'OK';
      upload: { onprogress: ((e: unknown) => void) | null } = { onprogress: null };
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onabort: (() => void) | null = null;
      headers: Record<string, string> = {};
      opened: [string, string] | null = null;
      constructor() {
        instances.push(this);
      }
      open(m: string, u: string) {
        this.opened = [m, u];
      }
      setRequestHeader(k: string, v: string) {
        this.headers[k] = v;
      }
      abort() {
        this.onabort?.();
      }
      send() {
        this.upload.onprogress?.({ lengthComputable: true, loaded: 5, total: 10 });
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal('XMLHttpRequest', FakeXhr);
    const ticks: number[] = [];
    await putWithProgress({
      url: 'https://bucket.example/obj',
      body: new Blob(['0123456789']),
      contentType: 'text/plain',
      onProgress: (l) => ticks.push(l),
    });
    expect(instances).toHaveLength(1);
    expect(instances[0]!.opened).toEqual(['PUT', 'https://bucket.example/obj']);
    expect(instances[0]!.headers['Content-Type']).toBe('text/plain');
    expect(ticks).toEqual([5, 10]);
  });
});

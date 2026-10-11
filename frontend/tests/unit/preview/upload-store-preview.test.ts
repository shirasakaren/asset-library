import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUploadStore } from '@/lib/upload/upload-store';
import { previewFetch, resetDemo } from '@/preview';
import { getBlobStore } from '@/preview/uploads/blob-store';
import type { AssetDetail } from '@/lib/api/types';

const SLUG = 'a-window-glass-shader';

async function target() {
  const d = await previewFetch<AssetDetail>(`/assets/${SLUG}`);
  return { assetId: d.id, versionId: d.versions[0]!.id, before: d.versions[0]!.files.length };
}

const status = (id: string) => useUploadStore.getState().tasks[id]?.status;
const only = () => Object.values(useUploadStore.getState().tasks)[0]!;

describe('upload store against the preview handlers', () => {
  beforeEach(async () => {
    await resetDemo();
    useUploadStore.setState({ tasks: {}, order: [] });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });
  afterEach(() => vi.useRealTimers());

  it('uploads a file: progress, complete, row on the version', async () => {
    const { assetId, versionId, before } = await target();
    const file = new File([new Uint8Array(3000)], 'Pack.unitypackage');
    useUploadStore
      .getState()
      .addFiles(assetId, versionId, [{ file, relativePath: 'Pack.unitypackage' }]);

    await vi.waitFor(() => expect(only().uploadId).toBeTruthy()); // initiate answered
    await vi.advanceTimersByTimeAsync(250);
    expect(only().status).toBe('uploading');
    expect(only().bytesUploaded).toBeGreaterThan(0);
    expect(only().bytesUploaded).toBeLessThan(3000);

    await vi.advanceTimersByTimeAsync(600);
    await vi.waitFor(() => expect(only().status).toBe('analyzing'));
    expect(only().bytesUploaded).toBe(3000);
    expect(only().fileId).toBeTruthy();

    const d = await previewFetch<AssetDetail>(`/assets/${assetId}`);
    const files = d.versions.find((v) => v.id === versionId)!.files;
    expect(files).toHaveLength(before + 1);
    expect(files.find((f) => f.id === only().fileId)).toMatchObject({
      relativePath: 'Pack.unitypackage',
      kind: 'UNITYPACKAGE',
      bytes: '3000',
    });
    expect((await getBlobStore().get(only().uploadId!))?.size).toBe(3000);
  });

  it('cancelling mid-upload leaves no file and no blob', async () => {
    const { assetId, versionId, before } = await target();
    const file = new File([new Uint8Array(3000)], 'x.bin');
    useUploadStore.getState().addFiles(assetId, versionId, [{ file, relativePath: 'x.bin' }]);
    await vi.waitFor(() => expect(only().uploadId).toBeTruthy());
    await vi.advanceTimersByTimeAsync(250);
    const id = only().id;
    useUploadStore.getState().cancel(id);
    await vi.advanceTimersByTimeAsync(1000);
    expect(status(id)).toBe('cancelled');
    const d = await previewFetch<AssetDetail>(`/assets/${assetId}`);
    expect(d.versions.find((v) => v.id === versionId)!.files).toHaveLength(before);
    expect(await getBlobStore().list()).toEqual([]);
  });

  it('a path traversal name fails the task with the server message', async () => {
    const { assetId, versionId } = await target();
    useUploadStore
      .getState()
      .addFiles(assetId, versionId, [{ file: new File(['x'], 'x'), relativePath: '../x' }]);
    await vi.waitFor(() => expect(only().status).toBe('failed'));
    expect(only().error).toMatch(/\.\./);
  });
});

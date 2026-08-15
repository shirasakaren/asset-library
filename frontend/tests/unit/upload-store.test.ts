import { describe, it, expect, beforeEach } from 'vitest';
import { useUploadStore, selectCompletedFileIdsFor } from '@/lib/upload/upload-store';
import type { UploadStatus, UploadTask } from '@/lib/upload/types';

function task(
  id: string,
  over: Partial<UploadTask> & { assetId?: string; versionId?: string; status?: UploadStatus } = {},
): UploadTask {
  const { assetId = 'a1', versionId = 'v1', status = 'queued', ...rest } = over;
  return {
    id,
    input: {
      assetId,
      versionId,
      // The selector/dismiss logic never touches the File blob.
      file: undefined as unknown as File,
      relativePath: `${id}.glb`,
    },
    status,
    bytesUploaded: 0,
    totalBytes: 1,
    ...rest,
  };
}

function seed(tasks: UploadTask[]) {
  useUploadStore.setState({
    tasks: Object.fromEntries(tasks.map((t) => [t.id, t])),
    order: tasks.map((t) => t.id),
  });
}

describe('uploadStore', () => {
  beforeEach(() => useUploadStore.setState({ tasks: {}, order: [] }));

  describe('selectCompletedFileIdsFor', () => {
    it('returns fileIds of finished uploads for the asset+version only', () => {
      seed([
        task('t1', { fileId: 'f1', status: 'analyzing' }),
        task('t2', { fileId: 'f2', status: 'ready' }),
        task('t3', { fileId: 'f3', status: 'av-scanning' }),
        task('t4', { fileId: 'f4', status: 'uploading' }), // not finished
        task('t5', { status: 'analyzing' }), // finished but no fileId yet
        task('t6', { fileId: 'f6', status: 'analyzing', versionId: 'other' }), // other version
        task('t7', { fileId: 'f7', status: 'analyzing', assetId: 'other' }), // other asset
      ]);
      const ids = selectCompletedFileIdsFor(useUploadStore.getState(), 'a1', 'v1');
      expect([...ids].sort()).toEqual(['f1', 'f2', 'f3']);
    });

    it('returns an empty array when nothing is finished', () => {
      seed([task('t1', { fileId: 'f1', status: 'uploading' })]);
      expect(selectCompletedFileIdsFor(useUploadStore.getState(), 'a1', 'v1')).toEqual([]);
    });
  });

  describe('setAuthProvider', () => {
    it('pulls a fresh token on each resolve, not the value at provider-registration time', async () => {
      let current = 'token-1';
      useUploadStore.getState().setAuthProvider(async () => current, 'en');
      expect(await useUploadStore.getState().__resolveAccessToken()).toBe('token-1');
      // Simulate Auth.js refresh in the background between requests.
      current = 'token-2';
      expect(await useUploadStore.getState().__resolveAccessToken()).toBe('token-2');
    });

    it('returns undefined when no provider is registered', async () => {
      useUploadStore.setState({ tokenProvider: undefined });
      expect(await useUploadStore.getState().__resolveAccessToken()).toBeUndefined();
    });
  });

  describe('dismissByFileId', () => {
    it('removes only the task matching the fileId', () => {
      seed([
        task('t1', { fileId: 'f1', status: 'analyzing' }),
        task('t2', { fileId: 'f2', status: 'analyzing' }),
      ]);
      useUploadStore.getState().dismissByFileId('f1');
      const { tasks, order } = useUploadStore.getState();
      expect(order).toEqual(['t2']);
      expect(tasks.t1).toBeUndefined();
      expect(tasks.t2).toBeDefined();
    });

    it('is a no-op when no task has the fileId', () => {
      seed([task('t1', { fileId: 'f1', status: 'analyzing' })]);
      useUploadStore.getState().dismissByFileId('does-not-exist');
      expect(useUploadStore.getState().order).toEqual(['t1']);
    });
  });
});

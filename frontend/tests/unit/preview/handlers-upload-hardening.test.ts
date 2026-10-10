import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { KvRecord } from '@/preview/records';
import { putWithProgress } from '@/lib/upload/put-with-progress';
import { getBlobStore } from '@/preview/uploads/blob-store';
import { appForWrites, status, storedOrThrow, type App } from './publish-fixtures';

const HOUR = 60 * 60 * 1000;
const ASSET = 'a-mine-draft';

const thumbInit = (app: App) =>
  app.call<{ putUrl: string; key: string }>('POST', '/files/thumbnails/initiate', {
    body: { assetId: ASSET, contentType: 'image/png', bytes: 4 },
  });
const thumbComplete = (app: App, key: string) =>
  app.call('POST', '/files/thumbnails/complete', { body: { assetId: ASSET, key } });
const edInit = (app: App, contentType: unknown, bytes = 10) =>
  app.call<{ putUrl: string; key: string }>('POST', '/files/editor-media/initiate', {
    body: { contentType, bytes },
  });
const refresh = (app: App, key: string) =>
  app.call<{ viewUrl: string }>('POST', '/files/editor-media/refresh', { body: { key } });

async function put(url: string, type: string) {
  const p = putWithProgress({
    url,
    body: new Blob([new Uint8Array([1, 2, 3, 4])], { type }),
    contentType: type,
  });
  await vi.advanceTimersByTimeAsync(700);
  await p;
}

/** Moves the test clock (fixed per app) forward. */
function advance(app: App, ms: number) {
  const at = app.ctx.now().getTime() + ms;
  app.ctx.now = () => new Date(at);
}

const blobIds = async () => (await getBlobStore().list()).map((m) => m.id);
const pendingRecords = async (app: App) =>
  (await app.db.list<KvRecord>('kv')).filter((r) => r.id.startsWith('thumb-pending:'));

beforeEach(async () => {
  await getBlobStore().clear();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});
afterEach(() => vi.useRealTimers());

describe('editor media content types', () => {
  it('accepts image, video, audio and 3D (model/* or the octet-stream fallback)', async () => {
    const app = await appForWrites({ timers: false });
    for (const type of [
      'image/png',
      'image/gif',
      'video/mp4',
      'audio/mpeg',
      'model/gltf-binary',
      'application/octet-stream',
    ]) {
      expect(await edInit(app, type), type).toMatchObject({ putUrl: expect.any(String) });
    }
  });

  it('rejects everything else with a 400 on contentType', async () => {
    const app = await appForWrites({ timers: false });
    for (const type of ['text/html', 'application/zip', 'application/pdf', 'text/plain', 'x']) {
      const err = await edInit(app, type).then(
        () => null,
        (e: unknown) => e as { status: number; fields?: { path: string }[] },
      );
      expect(err, type).not.toBeNull();
      expect(err!.status).toBe(400);
      expect(err!.fields?.[0]?.path).toBe('contentType');
    }
  });

  it('refresh will not turn a stored non-media blob into a data URL', async () => {
    const app = await appForWrites({ timers: false });
    const ini = await edInit(app, 'image/png');
    await put(ini.putUrl, 'text/html');
    await expect(refresh(app, ini.key)).rejects.toSatisfy(status(400));
    const ok = await edInit(app, 'image/png');
    await put(ok.putUrl, 'image/png');
    expect((await refresh(app, ok.key)).viewUrl).toMatch(/^data:image\/png/);
  });
});

describe('pending thumbnail uploads', () => {
  it('a thumbnail that is never completed is dropped by the next initiate after one hour', async () => {
    const app = await appForWrites({ timers: false });
    const a = await thumbInit(app);
    await put(a.putUrl, 'image/png');
    expect(await blobIds()).toHaveLength(1);
    expect(await pendingRecords(app)).toHaveLength(1);

    advance(app, HOUR - 1000);
    await thumbInit(app); // still fresh
    expect(await blobIds()).toHaveLength(1);
    expect(await pendingRecords(app)).toHaveLength(2);

    advance(app, 2000); // A is now older than an hour
    const c = await thumbInit(app);
    expect(await blobIds()).toEqual([]); // A's bytes are gone (B and C never uploaded any)
    const pending = await pendingRecords(app);
    expect(pending.map((r) => r.id)).toContain(`thumb-pending:${c.key.split('/').pop()}`);
    expect(pending.map((r) => r.id)).not.toContain(`thumb-pending:${a.key.split('/').pop()}`);
  });

  it('complete also prunes, keeps the upload it is completing, and clears its own record', async () => {
    const app = await appForWrites({ timers: false });
    const stale = await thumbInit(app);
    await put(stale.putUrl, 'image/png');
    const mine = await thumbInit(app);
    await put(mine.putUrl, 'image/png');
    advance(app, 3 * HOUR);
    await thumbComplete(app, mine.key); // older than an hour, but being completed now
    expect((await storedOrThrow(app, ASSET)).thumbnail.key).toBe(mine.key);
    expect(await blobIds()).toEqual([]);
    expect(await pendingRecords(app)).toEqual([]);
  });

  it('a completed upload leaves no pending record and is not pruned later', async () => {
    const app = await appForWrites({ timers: false });
    const a = await thumbInit(app);
    await put(a.putUrl, 'image/png');
    await thumbComplete(app, a.key);
    expect(await pendingRecords(app)).toEqual([]);
    advance(app, 5 * HOUR);
    await thumbInit(app);
    expect((await storedOrThrow(app, ASSET)).thumbnail.url).toMatch(/^data:image\/png/);
  });
});

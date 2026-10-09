import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiError } from '@/lib/api/errors';
import type { AssetDetail } from '@/lib/api/types';
import type { AssetFileRecord } from '@/preview/records';
import { putWithProgress } from '@/lib/upload/put-with-progress';
import { BLOB_STORE_MAX_BYTES, getBlobStore } from '@/preview/uploads/blob-store';
import {
  appForWrites,
  detail,
  doc,
  recordEvents,
  status,
  storedOrThrow,
  wizardCreateBody,
  type App,
} from './publish-fixtures';

interface Initiate {
  uploadId: string;
  putUrl: string;
  key: string;
  fileId: string;
  expiresAt: string;
}
interface Multipart {
  uploadId: string;
  key: string;
  fileId: string;
  partUrls: { partNumber: number; url: string }[];
  expiresAt: string;
}

const ctxInit = (assetId: string, versionId: string, over: Record<string, unknown> = {}) => ({
  assetId,
  versionId,
  relativePath: 'pack/model.fbx',
  contentType: 'application/octet-stream',
  bytes: 4,
  ...over,
});

const initiate = (app: App, body: unknown) =>
  app.call<Initiate>('POST', '/files/uploads/initiate', { body });
const complete = (app: App, uploadId: unknown) =>
  app.call<AssetFileRecord | undefined>('POST', '/files/uploads/complete', { body: { uploadId } });

/** A fresh persona draft (via the wizard's `POST /assets`) and its first version. */
async function newDraft(app: App) {
  const { id } = await app.call<{ id: string }>('POST', '/assets', { body: wizardCreateBody() });
  const d = await detail(app, id);
  return { assetId: id, versionId: d.versions[0]!.id };
}

const blobOf = (n: number) => new File([new Uint8Array(n).fill(9)], 'f.bin');

/** The real simulated PUT (fake timers must be on). */
async function put(url: string, body: Blob, contentType = 'application/octet-stream') {
  const p = putWithProgress({ url, body, contentType });
  await vi.advanceTimersByTimeAsync(700);
  await p;
}

async function files(app: App, assetId: string, versionId: string) {
  const a = await storedOrThrow(app, assetId);
  return a.versions.find((v) => v.id === versionId)!.files;
}

beforeEach(async () => {
  await getBlobStore().clear();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});
afterEach(() => vi.useRealTimers());

describe('POST /files/uploads/initiate', () => {
  it('returns the upload handle with a preview:// PUT URL', async () => {
    const app = await appForWrites({ timers: false });
    const { assetId, versionId } = await newDraft(app);
    const res = await initiate(app, ctxInit(assetId, versionId));
    expect(res.uploadId).toMatch(/^up_/);
    expect(res.putUrl).toBe(`preview://${res.uploadId}`);
    expect(res.key).toBe(`assets/${assetId}/${versionId}/pack/model.fbx`);
    expect(res.fileId).toBeTruthy();
    expect(new Date(res.expiresAt).getTime()).toBeGreaterThan(app.ctx.now().getTime());
    // nothing is recorded on the version until complete
    expect(await files(app, assetId, versionId)).toHaveLength(0);
  });

  it('normalizes the relative path (leading slash, backslashes, ./ segments, duplicate slashes)', async () => {
    const app = await appForWrites({ timers: false });
    const { assetId, versionId } = await newDraft(app);
    const res = await initiate(
      app,
      ctxInit(assetId, versionId, { relativePath: '//a\\b/./c//d.txt' }),
    );
    expect(res.key.endsWith('/a/b/c/d.txt')).toBe(true);
  });

  it.each([
    ['dot-dot segment', '../evil.txt'],
    ['nested dot-dot', 'a/../b.txt'],
    ['backslash dot-dot', 'a\\..\\b.txt'],
    ['dot-dot after a leading slash', '/../x'],
    ['empty', ''],
    ['only slashes', '///'],
    ['blank', '   '],
    ['NUL byte', 'a\u0000b.txt'],
    ['drive letter', 'C:/x.txt'],
    ['too long', `${'a'.repeat(513)}`],
    ['segment too long', `${'a'.repeat(256)}/x.txt`],
  ])('rejects a bad relativePath (%s)', async (_n, relativePath) => {
    const app = await appForWrites({ timers: false });
    const { assetId, versionId } = await newDraft(app);
    await expect(initiate(app, ctxInit(assetId, versionId, { relativePath }))).rejects.toSatisfy(
      status(400),
    );
  });

  it.each([
    ['negative', -1],
    ['fraction', 1.5],
    ['NaN', Number.NaN],
    ['string', '12'],
    ['absurd', 2 ** 50],
    ['unsafe', Number.MAX_SAFE_INTEGER + 2],
  ])('rejects bytes that are %s', async (_n, bytes) => {
    const app = await appForWrites({ timers: false });
    const { assetId, versionId } = await newDraft(app);
    const err = await initiate(app, ctxInit(assetId, versionId, { bytes })).catch((e) => e);
    expect(status(400)(err)).toBe(true);
    expect(err.fields?.[0]?.path).toBe('bytes');
  });

  it('accepts an empty file (backend: bytes >= 0) and a 3 GB file', async () => {
    const app = await appForWrites({ timers: false });
    const { assetId, versionId } = await newDraft(app);
    await initiate(app, ctxInit(assetId, versionId, { bytes: 0 }));
    await initiate(app, ctxInit(assetId, versionId, { bytes: 3 * 1024 ** 3 }));
  });

  it('rejects a malformed body', async () => {
    const app = await appForWrites({ timers: false });
    const { assetId, versionId } = await newDraft(app);
    await expect(initiate(app, undefined)).rejects.toSatisfy(status(400));
    await expect(initiate(app, ctxInit(assetId, versionId, { contentType: 5 }))).rejects.toSatisfy(
      status(400),
    );
    await expect(
      initiate(app, ctxInit(assetId, versionId, { contentType: 'x'.repeat(201) })),
    ).rejects.toSatisfy(status(400));
    await expect(initiate(app, ctxInit(assetId, '', {}))).rejects.toSatisfy(status(400));
  });

  it('404s for unknown asset, deleted asset and a version of another asset', async () => {
    const app = await appForWrites({ timers: false });
    const { assetId, versionId } = await newDraft(app);
    await expect(initiate(app, ctxInit('a-nope', versionId))).rejects.toSatisfy(
      status(404, 'asset.not_found'),
    );
    await expect(initiate(app, ctxInit('a-gone', versionId))).rejects.toSatisfy(status(404));
    await expect(initiate(app, ctxInit(assetId, 'v-nope'))).rejects.toSatisfy(
      status(404, 'version.not_found'),
    );
    await expect(initiate(app, ctxInit('a-mine-pub', versionId))).rejects.toSatisfy(
      status(404, 'version.not_found'),
    );
  });

  it('a non-owner non-admin gets 404 for a draft and 403 for a published asset', async () => {
    const app = await appForWrites({ timers: false, meId: 'u-third' });
    const draft = (await storedOrThrow(app, 'a-other-draft')).versions[0]!;
    await expect(initiate(app, ctxInit('a-other-draft', draft.id))).rejects.toSatisfy(
      status(404, 'asset.not_found'),
    );
    const pub = (await storedOrThrow(app, 'a-fx-001')).versions[0]!;
    await expect(initiate(app, ctxInit('a-fx-001', pub.id))).rejects.toSatisfy(
      status(403, 'auth.forbidden'),
    );
  });

  it('allows uploads to a published version (the wizard "Update" flow)', async () => {
    const app = await appForWrites({ timers: false });
    const pub = (await storedOrThrow(app, 'a-mine-pub')).versions[0]!;
    await initiate(app, ctxInit('a-mine-pub', pub.id));
  });
});

describe('POST /files/uploads/complete', () => {
  it('records the file with kind and the stored size, updates totals and goes PENDING', async () => {
    const app = await appForWrites({ timers: false });
    const { assetId, versionId } = await newDraft(app);
    const ini = await initiate(app, ctxInit(assetId, versionId, { bytes: 99 }));
    await put(ini.putUrl, blobOf(1234));
    const rec = await complete(app, ini.uploadId);

    expect(rec).toMatchObject({
      id: ini.fileId,
      relativePath: 'pack/model.fbx',
      kind: 'FBX',
      bytes: '1234',
    });
    const v = (await storedOrThrow(app, assetId)).versions[0]!;
    expect(v.files).toHaveLength(1);
    expect(v.bytesTotal).toBe('1234');
    expect(v.fileCount).toBe(1);
    expect(v.analysisStatus).toBe('PENDING');
    const d = await detail(app, assetId);
    expect(d.versions[0]!.files[0]).toMatchObject({ id: ini.fileId, kind: 'FBX', bytes: '1234' });
  });

  it('detects kinds from the extension', async () => {
    const app = await appForWrites({ timers: false });
    const { assetId, versionId } = await newDraft(app);
    for (const [path, kind] of [
      ['Pack.unitypackage', 'UNITYPACKAGE'],
      ['tex/brick_normal.png', 'NORMAL_MAP'],
      ['a.zip', 'ARCHIVE'],
      ['readme', 'OTHER'],
    ] as const) {
      const ini = await initiate(app, ctxInit(assetId, versionId, { relativePath: path }));
      await put(ini.putUrl, blobOf(3));
      expect((await complete(app, ini.uploadId))!.kind).toBe(kind);
    }
    expect(await files(app, assetId, versionId)).toHaveLength(4);
  });

  it('falls back to the declared size when no bytes arrived', async () => {
    const app = await appForWrites({ timers: false });
    const { assetId, versionId } = await newDraft(app);
    const ini = await initiate(app, ctxInit(assetId, versionId, { bytes: 77 }));
    expect((await complete(app, ini.uploadId))!.bytes).toBe('77');
  });

  it('is idempotent for the same uploadId (no duplicate row)', async () => {
    const app = await appForWrites({ timers: false });
    const { assetId, versionId } = await newDraft(app);
    const ini = await initiate(app, ctxInit(assetId, versionId));
    await put(ini.putUrl, blobOf(10));
    const first = await complete(app, ini.uploadId);
    const second = await complete(app, ini.uploadId);
    expect(second).toEqual(first);
    const f = await files(app, assetId, versionId);
    expect(f).toHaveLength(1);
    expect((await storedOrThrow(app, assetId)).versions[0]!.bytesTotal).toBe('10');
  });

  it('two concurrent completes still leave one row', async () => {
    const app = await appForWrites({ timers: false });
    const { assetId, versionId } = await newDraft(app);
    const ini = await initiate(app, ctxInit(assetId, versionId));
    await put(ini.putUrl, blobOf(10));
    await Promise.all([complete(app, ini.uploadId), complete(app, ini.uploadId)]);
    expect(await files(app, assetId, versionId)).toHaveLength(1);
  });

  it('404s for an unknown upload and 400s for the wrong endpoint or body', async () => {
    const app = await appForWrites({ timers: false });
    const { assetId, versionId } = await newDraft(app);
    await expect(complete(app, 'up_nope')).rejects.toSatisfy(status(404, 'file.upload_not_found'));
    await expect(complete(app, undefined)).rejects.toSatisfy(status(400));
    const mp = await app.call<Multipart>('POST', '/files/uploads/multipart/initiate', {
      body: ctxInit(assetId, versionId, { partCount: 2 }),
    });
    await expect(complete(app, mp.uploadId)).rejects.toSatisfy(status(400));
  });

  it('is rejected when the asset was deleted in between', async () => {
    const app = await appForWrites({ timers: false });
    const { assetId, versionId } = await newDraft(app);
    const ini = await initiate(app, ctxInit(assetId, versionId));
    await app.call('DELETE', `/assets/${assetId}`);
    await expect(complete(app, ini.uploadId)).rejects.toSatisfy(status(404));
  });

  it('answers 404 once the completed file was deleted (no resurrection)', async () => {
    const app = await appForWrites({ timers: false });
    const { assetId, versionId } = await newDraft(app);
    const ini = await initiate(app, ctxInit(assetId, versionId));
    await put(ini.putUrl, blobOf(10));
    await complete(app, ini.uploadId);
    await app.call('DELETE', `/files/${ini.fileId}`);
    await expect(complete(app, ini.uploadId)).rejects.toSatisfy(status(404));
    expect(await files(app, assetId, versionId)).toHaveLength(0);
  });

  it('over 5 MB keeps metadata only', async () => {
    const app = await appForWrites({ timers: false });
    const { assetId, versionId } = await newDraft(app);
    const size = BLOB_STORE_MAX_BYTES + 1024;
    const ini = await initiate(app, ctxInit(assetId, versionId, { bytes: size }));
    await put(ini.putUrl, blobOf(size));
    const rec = await complete(app, ini.uploadId);
    expect(rec!.bytes).toBe(String(size));
    expect(rec!.meta).toMatchObject({ upload: { blobId: ini.uploadId, stored: false } });
    expect(await getBlobStore().get(ini.uploadId)).toMatchObject({ stored: false, blob: null });
  });
});

describe('end to end: create, upload, analyse, publish', () => {
  it('uploads a thumbnail and a file, the analysis turns READY after 2 s and publish succeeds', async () => {
    const app = await appForWrites();
    const rec = recordEvents();
    const { assetId, versionId } = await newDraft(app);
    await app.call('PATCH', `/assets/${assetId}`, {
      body: {
        translations: [{ locale: 'en', shortDescription: 'Short', longDescription: doc('Long') }],
      },
    });
    await app.call('POST', `/assets/${assetId}/versions/${versionId}/compatibility`, {
      body: {
        rows: [{ engineVersion: '2022.3', renderPipelines: ['URP'], targets: ['WINDOWS'] }],
      },
    });

    // thumbnail
    const thumb = await app.call<{ putUrl: string; key: string }>(
      'POST',
      '/files/thumbnails/initiate',
      { body: { assetId, contentType: 'image/png', bytes: 8 } },
    );
    await put(thumb.putUrl, new Blob([new Uint8Array(8)], { type: 'image/png' }), 'image/png');
    await app.call('POST', '/files/thumbnails/complete', { body: { assetId, key: thumb.key } });

    // package file
    const ini = await initiate(
      app,
      ctxInit(assetId, versionId, { relativePath: 'My Pack.unitypackage' }),
    );
    await put(ini.putUrl, blobOf(2048));
    await complete(app, ini.uploadId);

    expect((await storedOrThrow(app, assetId)).versions[0]!.analysisStatus).toBe('PENDING');
    // still analysing: publish goes through with a warning
    await vi.advanceTimersByTimeAsync(2100);
    expect((await storedOrThrow(app, assetId)).versions[0]!.analysisStatus).toBe('READY');
    expect(rec.events).toContainEqual({ type: 'version.ready', assetId, versionId });

    const res = await app.call<{ warnings: unknown[] }>('POST', `/assets/${assetId}/publish`);
    expect(res.warnings).toEqual([]);
    const d: AssetDetail = await detail(app, assetId);
    expect(d.status).toBe('PUBLISHED');
    expect(d.versions[0]!.files[0]).toMatchObject({
      relativePath: 'My Pack.unitypackage',
      kind: 'UNITYPACKAGE',
      bytes: '2048',
    });
    rec.stop();
  });

  it('a draft without files fails the checklist with version.files', async () => {
    const app = await appForWrites({ timers: false });
    const { assetId } = await newDraft(app);
    const err = (await app.call('POST', `/assets/${assetId}/publish`).catch((e) => e)) as ApiError;
    expect(err.fields!.map((f) => f.path)).toContain('version.files');
  });
});

describe('multipart uploads', () => {
  const mpInit = (
    app: App,
    assetId: string,
    versionId: string,
    over: Record<string, unknown> = {},
  ) =>
    app.call<Multipart>('POST', '/files/uploads/multipart/initiate', {
      body: ctxInit(assetId, versionId, {
        relativePath: 'big/archive.zip',
        partCount: 3,
        bytes: 30,
        ...over,
      }),
    });
  const mpComplete = (app: App, uploadId: unknown) =>
    app.call<AssetFileRecord | undefined>('POST', '/files/uploads/multipart/complete', {
      body: { uploadId },
    });

  it('initiate returns one preview:// URL per part', async () => {
    const app = await appForWrites({ timers: false });
    const { assetId, versionId } = await newDraft(app);
    const mp = await mpInit(app, assetId, versionId);
    expect(mp.partUrls).toEqual(
      [1, 2, 3].map((n) => ({ partNumber: n, url: `preview://${mp.uploadId}/part/${n}` })),
    );
    expect(mp.key).toBe(`assets/${assetId}/${versionId}/big/archive.zip`);
    expect(await files(app, assetId, versionId)).toHaveLength(0);
  });

  it.each([0, 10_001, 1.5, 'x'])('rejects partCount %s', async (partCount) => {
    const app = await appForWrites({ timers: false });
    const { assetId, versionId } = await newDraft(app);
    await expect(mpInit(app, assetId, versionId, { partCount })).rejects.toSatisfy(status(400));
  });

  it('sign returns part URLs for the requested numbers', async () => {
    const app = await appForWrites({ timers: false });
    const { assetId, versionId } = await newDraft(app);
    const mp = await mpInit(app, assetId, versionId);
    const signed = await app.call<{ partNumber: number; url: string }[]>(
      'POST',
      '/files/uploads/multipart/sign',
      { body: { uploadId: mp.uploadId, partNumbers: [2, 3] } },
    );
    expect(signed).toEqual([
      { partNumber: 2, url: `preview://${mp.uploadId}/part/2` },
      { partNumber: 3, url: `preview://${mp.uploadId}/part/3` },
    ]);
    await expect(
      app.call('POST', '/files/uploads/multipart/sign', {
        body: { uploadId: mp.uploadId, partNumbers: [0] },
      }),
    ).rejects.toSatisfy(status(400));
    await expect(
      app.call('POST', '/files/uploads/multipart/sign', {
        body: { uploadId: 'up_x', partNumbers: [1] },
      }),
    ).rejects.toSatisfy(status(404, 'file.upload_not_found'));
    const single = await initiate(app, ctxInit(assetId, versionId));
    await expect(
      app.call('POST', '/files/uploads/multipart/sign', {
        body: { uploadId: single.uploadId, partNumbers: [1] },
      }),
    ).rejects.toSatisfy(status(400));
  });

  it('assembles small parts into one stored blob and one file row', async () => {
    const app = await appForWrites({ timers: false });
    const { assetId, versionId } = await newDraft(app);
    const mp = await mpInit(app, assetId, versionId);
    for (const part of mp.partUrls) await put(part.url, blobOf(10 * part.partNumber));
    const rec = await mpComplete(app, mp.uploadId);
    expect(rec).toMatchObject({ id: mp.fileId, kind: 'ARCHIVE', bytes: '60' });
    const store = getBlobStore();
    expect((await store.get(mp.uploadId))?.size).toBe(60);
    expect((await store.get(mp.uploadId))?.stored).toBe(true);
    expect((await store.list()).filter((m) => m.id.includes('/part/'))).toEqual([]);
    expect((await storedOrThrow(app, assetId)).versions[0]!.bytesTotal).toBe('60');
    // idempotent
    expect(await mpComplete(app, mp.uploadId)).toEqual(rec);
    expect(await files(app, assetId, versionId)).toHaveLength(1);
  });

  it('big parts keep metadata only but the file still has the full size', async () => {
    const app = await appForWrites({ timers: false });
    const { assetId, versionId } = await newDraft(app);
    const mp = await mpInit(app, assetId, versionId, { partCount: 2 });
    const part = BLOB_STORE_MAX_BYTES + 5;
    for (const p of mp.partUrls) await put(p.url, blobOf(part));
    const rec = await mpComplete(app, mp.uploadId);
    expect(rec!.bytes).toBe(String(part * 2));
    expect(await getBlobStore().get(mp.uploadId)).toMatchObject({ stored: false, size: part * 2 });
  });

  it('complete with no uploaded parts is a 400 and abort discards everything', async () => {
    const app = await appForWrites({ timers: false });
    const { assetId, versionId } = await newDraft(app);
    const mp = await mpInit(app, assetId, versionId);
    await expect(mpComplete(app, mp.uploadId)).rejects.toSatisfy(status(400));

    await put(mp.partUrls[0]!.url, blobOf(5));
    await app.call('POST', '/files/uploads/multipart/abort', { body: { uploadId: mp.uploadId } });
    expect(await getBlobStore().list()).toEqual([]);
    await expect(mpComplete(app, mp.uploadId)).rejects.toSatisfy(status(404));
    await expect(
      app.call('POST', '/files/uploads/multipart/abort', { body: { uploadId: mp.uploadId } }),
    ).rejects.toSatisfy(status(404, 'file.upload_not_found'));
    expect(await files(app, assetId, versionId)).toHaveLength(0);
  });

  it('a non-owner cannot touch someone else upload', async () => {
    const app = await appForWrites({ timers: false });
    const { assetId, versionId } = await newDraft(app);
    const mp = await mpInit(app, assetId, versionId);
    // same db, different persona
    const intruder = { ...app, ctx: { ...app.ctx, meId: 'u-third' } };
    await expect(
      (async () => {
        const { dispatch } = await import('@/preview/router/router');
        return dispatch(
          {
            method: 'POST',
            path: '/files/uploads/multipart/abort',
            query: new URLSearchParams(),
            body: { uploadId: mp.uploadId },
            locale: 'en',
          },
          intruder.ctx,
        );
      })(),
    ).rejects.toSatisfy(status(404));
  });
});

describe('thumbnails', () => {
  const thumbInit = (app: App, body: unknown) =>
    app.call<{ putUrl: string; key: string; expiresAt: string }>(
      'POST',
      '/files/thumbnails/initiate',
      { body },
    );
  const thumbComplete = (app: App, body: unknown) =>
    app.call<undefined>('POST', '/files/thumbnails/complete', { body });
  const png = () => new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' });

  it('stores the image as a data URL on the asset thumbnail and drops the blob', async () => {
    const app = await appForWrites({ timers: false });
    const { assetId } = await newDraft(app);
    const ini = await thumbInit(app, { assetId, contentType: 'image/png', bytes: 4 });
    expect(ini.putUrl).toMatch(/^preview:\/\//);
    expect(ini.key.startsWith(`thumbs/${assetId}/`)).toBe(true);
    await put(ini.putUrl, png(), 'image/png');
    await thumbComplete(app, { assetId, key: ini.key });

    const stored = await storedOrThrow(app, assetId);
    expect(stored.thumbnail.key).toBe(ini.key);
    expect(stored.thumbnail.url).toBe('data:image/png;base64,iVBORw==');
    expect((await detail(app, assetId)).thumbnail.url).toBe(stored.thumbnail.url);
    expect(await getBlobStore().list()).toEqual([]);
  });

  it('is idempotent and replaceable', async () => {
    const app = await appForWrites({ timers: false });
    const { assetId } = await newDraft(app);
    const a = await thumbInit(app, { assetId, contentType: 'image/png', bytes: 4 });
    await put(a.putUrl, png(), 'image/png');
    await thumbComplete(app, { assetId, key: a.key });
    await thumbComplete(app, { assetId, key: a.key });
    const b = await thumbInit(app, { assetId, contentType: 'image/webp', bytes: 4 });
    await put(b.putUrl, new Blob(['xx'], { type: 'image/webp' }), 'image/webp');
    await thumbComplete(app, { assetId, key: b.key });
    expect((await storedOrThrow(app, assetId)).thumbnail.key).toBe(b.key);
    expect((await storedOrThrow(app, assetId)).thumbnail.url?.startsWith('data:image/webp')).toBe(
      true,
    );
  });

  it('validates input', async () => {
    const app = await appForWrites({ timers: false });
    const { assetId } = await newDraft(app);
    await expect(
      thumbInit(app, { assetId, contentType: 'text/plain', bytes: 4 }),
    ).rejects.toSatisfy(status(400));
    await expect(
      thumbInit(app, { assetId, contentType: 'image/png', bytes: -1 }),
    ).rejects.toSatisfy(status(400));
    await expect(
      thumbInit(app, { assetId, contentType: 'image/png', bytes: BLOB_STORE_MAX_BYTES + 1 }),
    ).rejects.toSatisfy(status(400));
    await expect(thumbInit(app, { contentType: 'image/png', bytes: 4 })).rejects.toSatisfy(
      status(400),
    );
    await expect(
      thumbInit(app, { assetId: 'a-nope', contentType: 'image/png', bytes: 4 }),
    ).rejects.toSatisfy(status(404, 'asset.not_found'));
    await expect(thumbComplete(app, { assetId })).rejects.toSatisfy(status(400));
  });

  it('refuses a key outside the asset prefix and a missing upload', async () => {
    const app = await appForWrites({ timers: false });
    const { assetId } = await newDraft(app);
    await expect(thumbComplete(app, { assetId, key: 'thumbs/other/abc' })).rejects.toSatisfy(
      status(403, 'auth.forbidden'),
    );
    await expect(
      thumbComplete(app, { assetId, key: `thumbs/${assetId}/up_none` }),
    ).rejects.toSatisfy(status(404, 'file.upload_not_found'));
    await expect(thumbComplete(app, { assetId, key: `thumbs/${assetId}/a/b` })).rejects.toSatisfy(
      status(400),
    );
  });

  it('a non-owner cannot change the thumbnail', async () => {
    const app = await appForWrites({ timers: false, meId: 'u-third' });
    await expect(
      thumbInit(app, { assetId: 'a-fx-001', contentType: 'image/png', bytes: 4 }),
    ).rejects.toSatisfy(status(403));
    await expect(
      thumbInit(app, { assetId: 'a-other-draft', contentType: 'image/png', bytes: 4 }),
    ).rejects.toSatisfy(status(404));
  });
});

describe('editor media', () => {
  const edInit = (app: App, body: unknown) =>
    app.call<{ putUrl: string; key: string; viewUrl: string; expiresAt: string }>(
      'POST',
      '/files/editor-media/initiate',
      { body },
    );
  const refresh = (app: App, key: unknown) =>
    app.call<{ viewUrl: string; expiresAt: string }>('POST', '/files/editor-media/refresh', {
      body: { key },
    });

  it('initiate returns a preview PUT URL, a key and a stable reference', async () => {
    const app = await appForWrites({ timers: false });
    const res = await edInit(app, { contentType: 'image/png', bytes: 4 });
    expect(res.putUrl).toMatch(/^preview:\/\//);
    expect(res.key.startsWith('editor/u-persona/')).toBe(true);
    expect(res.viewUrl.startsWith('preview-blob:')).toBe(true);
    expect(new Date(res.expiresAt).getTime()).toBeGreaterThan(app.ctx.now().getTime());
  });

  it('refresh turns the stored upload into a data URL that survives reloads', async () => {
    const app = await appForWrites({ timers: false });
    const ini = await edInit(app, { contentType: 'image/gif', bytes: 3 });
    await put(ini.putUrl, new Blob(['GIF'], { type: 'image/gif' }), 'image/gif');
    const a = await refresh(app, ini.key);
    expect(a.viewUrl).toBe(`data:image/gif;base64,${btoa('GIF')}`);
    expect((await refresh(app, ini.key)).viewUrl).toBe(a.viewUrl);
  });

  it('refresh of a missing upload returns a placeholder picture', async () => {
    const app = await appForWrites({ timers: false });
    const res = await refresh(app, 'editor/u-persona/up_gone');
    expect(res.viewUrl.startsWith('data:image/svg+xml')).toBe(true);
  });

  it('validates input and keys', async () => {
    const app = await appForWrites({ timers: false });
    await expect(edInit(app, { contentType: 'image/png', bytes: -3 })).rejects.toSatisfy(
      status(400),
    );
    await expect(edInit(app, { contentType: 7, bytes: 3 })).rejects.toSatisfy(status(400));
    await expect(
      edInit(app, { contentType: 'video/mp4', bytes: BLOB_STORE_MAX_BYTES + 1 }),
    ).rejects.toSatisfy(status(400));
    await expect(refresh(app, 'thumbs/x/y')).rejects.toSatisfy(status(400));
    await expect(refresh(app, 'editor/../x')).rejects.toSatisfy(status(403));
    await expect(refresh(app, '')).rejects.toSatisfy(status(400));
  });
});

describe('POST /files/versions/{versionId}/reorder', () => {
  async function withFiles(app: App) {
    const { assetId, versionId } = await newDraft(app);
    const ids: string[] = [];
    for (const name of ['a.txt', 'b.txt', 'c.txt']) {
      const ini = await initiate(app, ctxInit(assetId, versionId, { relativePath: name }));
      await put(ini.putUrl, blobOf(1));
      await complete(app, ini.uploadId);
      ids.push(ini.fileId);
    }
    return { assetId, versionId, ids };
  }
  const reorder = (app: App, versionId: string, body: unknown) =>
    app.call<undefined>('POST', `/files/versions/${versionId}/reorder`, { body });
  const order = async (app: App, assetId: string, versionId: string) =>
    (await files(app, assetId, versionId)).map((f) => f.relativePath);

  it('applies the new order and the detail reflects it', async () => {
    const app = await appForWrites({ timers: false });
    const { assetId, versionId, ids } = await withFiles(app);
    await reorder(app, versionId, { orderedFileIds: [ids[2], ids[0], ids[1]] });
    expect(await order(app, assetId, versionId)).toEqual(['c.txt', 'a.txt', 'b.txt']);
    expect((await detail(app, assetId)).versions[0]!.files.map((f) => f.relativePath)).toEqual([
      'c.txt',
      'a.txt',
      'b.txt',
    ]);
  });

  it('omitted and unknown ids: omitted files follow in their old order, unknown ids are ignored', async () => {
    const app = await appForWrites({ timers: false });
    const { assetId, versionId, ids } = await withFiles(app);
    await reorder(app, versionId, { orderedFileIds: ['ghost', ids[2]] });
    expect(await order(app, assetId, versionId)).toEqual(['c.txt', 'a.txt', 'b.txt']);
  });

  it('rejects a malformed body, unknown versions and non-owners', async () => {
    const app = await appForWrites({ timers: false });
    const { versionId } = await withFiles(app);
    await expect(reorder(app, versionId, { orderedFileIds: 'x' })).rejects.toSatisfy(status(400));
    await expect(reorder(app, versionId, {})).rejects.toSatisfy(status(400));
    await expect(reorder(app, 'v-nope', { orderedFileIds: [] })).rejects.toSatisfy(
      status(404, 'version.not_found'),
    );
    const other = await appForWrites({ timers: false, meId: 'u-third' });
    const pubV = (await storedOrThrow(other, 'a-fx-001')).versions[0]!.id;
    await expect(reorder(other, pubV, { orderedFileIds: [] })).rejects.toSatisfy(status(403));
  });
});

describe('DELETE /files/{fileId}', () => {
  it('removes the file and its blob, recomputes totals, and the checklist then lacks files', async () => {
    const app = await appForWrites({ timers: false });
    const { assetId, versionId } = await newDraft(app);
    const ini = await initiate(app, ctxInit(assetId, versionId));
    await put(ini.putUrl, blobOf(50));
    await complete(app, ini.uploadId);
    expect(await getBlobStore().get(ini.uploadId)).toBeDefined();

    await app.call('DELETE', `/files/${ini.fileId}`);

    expect(await files(app, assetId, versionId)).toHaveLength(0);
    const v = (await storedOrThrow(app, assetId)).versions[0]!;
    expect(v.bytesTotal).toBe('0');
    expect(v.fileCount).toBe(0);
    expect(await getBlobStore().get(ini.uploadId)).toBeUndefined();
    const err = (await app.call('POST', `/assets/${assetId}/publish`).catch((e) => e)) as ApiError;
    expect(err.fields!.map((f) => f.path)).toContain('version.files');
  });

  it('deletes a seeded-style (link) file without a blob', async () => {
    const app = await appForWrites({ timers: false });
    const fileId = (await storedOrThrow(app, 'a-mine-draft')).versions[0]!.files[0]!.id;
    await app.call('DELETE', `/files/${fileId}`);
    expect((await storedOrThrow(app, 'a-mine-draft')).versions[0]!.files).toHaveLength(0);
  });

  it('404s for unknown files and 403s for non-owners', async () => {
    const app = await appForWrites({ timers: false });
    await expect(app.call('DELETE', '/files/f-nope')).rejects.toSatisfy(status(404));
    const other = await appForWrites({ timers: false, meId: 'u-third' });
    const fid = (await storedOrThrow(other, 'a-fx-001')).versions[0]!.files[0]!.id;
    await expect(other.call('DELETE', `/files/${fid}`)).rejects.toSatisfy(status(403));
    expect((await storedOrThrow(other, 'a-fx-001')).versions[0]!.files).toHaveLength(1);
  });
});

describe('stale handles', () => {
  it('an initiate prunes handles older than a day (and their blobs)', async () => {
    const app = await appForWrites({ timers: false });
    const { assetId, versionId } = await newDraft(app);
    const old = await initiate(app, ctxInit(assetId, versionId));
    await put(old.putUrl, blobOf(5));
    const later = new Date(app.ctx.now().getTime() + 25 * 3600_000);
    app.ctx.now = () => later;
    await initiate(app, ctxInit(assetId, versionId));
    await expect(complete(app, old.uploadId)).rejects.toSatisfy(status(404));
    expect(await getBlobStore().get(old.uploadId)).toBeUndefined();
  });
});

describe('real seed smoke', () => {
  it('uploads into a seeded persona draft and the owner sees the file', async () => {
    const { createSeededTestApp } = await import('@/preview/test-utils');
    const app = await createSeededTestApp({ timers: false });
    const d = await app.call<AssetDetail>('GET', '/assets/a-window-glass-shader');
    const vid = d.versions[0]!.id;
    const ini = await app.call<Initiate>('POST', '/files/uploads/initiate', {
      body: ctxInit(d.id, vid, { relativePath: 'extra/readme.md' }),
    });
    await put(ini.putUrl, blobOf(12));
    await app.call('POST', '/files/uploads/complete', { body: { uploadId: ini.uploadId } });
    const after = await app.call<AssetDetail>('GET', '/assets/a-window-glass-shader');
    const f = after.versions[0]!.files.find((x) => x.id === ini.fileId);
    expect(f).toMatchObject({ relativePath: 'extra/readme.md', bytes: '12' });
    expect(after.versions[0]!.files.length).toBe(d.versions[0]!.files.length + 1);
    // someone else's published asset: the persona is an admin, so allowed; a deleted id is not
    await expect(
      app.call('POST', '/files/uploads/initiate', { body: ctxInit('a-does-not-exist', vid) }),
    ).rejects.toSatisfy(status(404));
  });
});

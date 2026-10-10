import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DownloadOptions } from '@/lib/api/types';
import type {
  AnalyticsRecord,
  AssetAnalyticsRecord,
  AssetRecord,
  LibraryRecord,
} from '@/preview/records';
import { putWithProgress } from '@/lib/upload/put-with-progress';
import { BLOB_STORE_MAX_BYTES, getBlobStore } from '@/preview/uploads/blob-store';
import { clearObjectUrls } from '@/preview/uploads/blob-url';
import {
  appForWrites,
  doc,
  recordEvents,
  status,
  storedOrThrow,
  type App,
} from './publish-fixtures';

/** Stubs `URL.createObjectURL` and remembers every blob it was given, by URL. */
function stubObjectUrls() {
  const blobs = new Map<string, Blob>();
  let n = 0;
  URL.createObjectURL = (b: Blob) => {
    n += 1;
    const url = `blob:test/${n}`;
    blobs.set(url, b);
    return url;
  };
  URL.revokeObjectURL = () => {};
  return {
    blobs,
    text: (url: string) =>
      new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(r.error);
        r.readAsText(blobs.get(url)!);
      }),
  };
}

const options = (app: App, assetId: string, versionId: string) =>
  app.call<DownloadOptions>('GET', '/downloads/options', { query: { assetId, versionId } });
const download = (app: App, body: unknown) =>
  app.call<DownloadOptions>('POST', '/downloads', { body });

let urls: ReturnType<typeof stubObjectUrls>;
beforeEach(async () => {
  clearObjectUrls();
  await getBlobStore().clear();
  urls = stubObjectUrls();
});
afterEach(() => {
  clearObjectUrls();
  // @ts-expect-error restore the jsdom default (not implemented)
  delete URL.createObjectURL;
  // @ts-expect-error restore the jsdom default (not implemented)
  delete URL.revokeObjectURL;
  vi.useRealTimers();
});

const pubVersion = async (app: App, id = 'a-mine-pub') =>
  (await storedOrThrow(app, id)).versions[0]!;

describe('GET /downloads/options', () => {
  it('lists the files of a version with a text Blob URL for a seeded link file', async () => {
    const app = await appForWrites({ timers: false });
    const v = await pubVersion(app);
    const res = await options(app, 'a-mine-pub', v.id);
    expect(res.asset).toEqual({ id: 'a-mine-pub', title: 'Mine Published' });
    expect(res.version).toEqual({ id: v.id, semver: '1.0.0', releaseNotes: null });
    expect(res.files).toHaveLength(1);
    const f = res.files[0]!;
    expect(f).toMatchObject({
      id: v.files[0]!.id,
      relativePath: v.files[0]!.relativePath,
      kind: 'OTHER',
      bytes: '10',
    });
    expect(f.getUrl).toMatch(/^blob:test\//);
    expect(await urls.text(f.getUrl!)).toBe('x');
    expect(urls.blobs.get(f.getUrl!)!.type).toMatch(/^text\/plain/);
    expect(Date.parse(f.expiresAt!) - app.ctx.now().getTime()).toBeGreaterThan(3590_000);
    expect(Date.parse(f.expiresAt!) - app.ctx.now().getTime()).toBeLessThanOrEqual(3600_000);
    expect(res.olderVersions).toEqual([]);
  });

  it('reuses the Blob URL for the same file', async () => {
    const app = await appForWrites({ timers: false });
    const v = await pubVersion(app);
    const a = await options(app, 'a-mine-pub', v.id);
    const b = await options(app, 'a-mine-pub', v.id);
    expect(b.files[0]!.getUrl).toBe(a.files[0]!.getUrl);
    expect(urls.blobs.size).toBe(1);
  });

  it('getUrl is null when the browser has no object URLs', async () => {
    // @ts-expect-error simulate an environment without it
    delete URL.createObjectURL;
    const app = await appForWrites({ timers: false });
    const v = await pubVersion(app);
    const res = await options(app, 'a-mine-pub', v.id);
    expect(res.files[0]).toMatchObject({ getUrl: null, expiresAt: null });
  });

  it('adapts a bare TipTap release-notes document and lists older published versions', async () => {
    const app = await appForWrites({ timers: false });
    const a = await storedOrThrow(app, 'a-mine-pub');
    const base = a.versions[0]!;
    const mk = (id: string, semver: string, publishedAt: string | null, notes: unknown) => ({
      ...base,
      id,
      semver,
      publishedAt,
      isLatest: false,
      releaseNotes: notes as never,
      files: [{ ...base.files[0]!, id: `f-${id}` }],
    });
    await app.db.patch<AssetRecord>('assets', 'a-mine-pub', {
      versions: [
        mk('v-old', '0.9.0', '2026-01-01T00:00:00.000Z', null),
        mk('v-mid', '0.9.5', '2026-02-01T00:00:00.000Z', null),
        { ...mk('v-new', '1.1.0', '2026-03-01T00:00:00.000Z', doc('Bare notes')), isLatest: true },
        mk('v-draft', '1.2.0', null, null),
      ],
    });
    const res = await options(app, 'a-mine-pub', 'v-new');
    expect(res.version.releaseNotes).toEqual({ en: doc('Bare notes') });
    expect(res.olderVersions).toEqual([
      { id: 'v-mid', semver: '0.9.5', publishedAt: '2026-02-01T00:00:00.000Z' },
      { id: 'v-old', semver: '0.9.0', publishedAt: '2026-01-01T00:00:00.000Z' },
    ]);
  });

  it('serves an uploaded file from the blob store and a placeholder for one over 5 MB', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const app = await appForWrites({ timers: false });
    const { id: assetId } = await app.call<{ id: string }>('POST', '/assets', {
      body: {
        title: 'Upload Me',
        engine: 'UNITY',
        categoryId: 'cat-3d-models',
        licenseId: 'lic-mit',
        semver: '1.0.0',
        translations: [{ locale: 'en', shortDescription: '', longDescription: doc('') }],
      },
    });
    const versionId = (await storedOrThrow(app, assetId)).versions[0]!.id;
    const send = async (path: string, bytes: Uint8Array) => {
      const ini = await app.call<{ uploadId: string; putUrl: string; fileId: string }>(
        'POST',
        '/files/uploads/initiate',
        {
          body: {
            assetId,
            versionId,
            relativePath: path,
            contentType: 'application/zip',
            bytes: bytes.length,
          },
        },
      );
      const p = putWithProgress({
        url: ini.putUrl,
        body: new Blob([bytes as BlobPart]),
        contentType: 'application/zip',
      });
      await vi.advanceTimersByTimeAsync(700);
      await p;
      await app.call('POST', '/files/uploads/complete', { body: { uploadId: ini.uploadId } });
      return ini.fileId;
    };
    const smallId = await send('dir/small.zip', new Uint8Array([104, 105]));
    const bigId = await send('big.unitypackage', new Uint8Array(BLOB_STORE_MAX_BYTES + 1));

    const res = await options(app, assetId, versionId);
    const small = res.files.find((f) => f.id === smallId)!;
    const big = res.files.find((f) => f.id === bigId)!;
    expect(await urls.text(small.getUrl!)).toBe('hi');
    expect(urls.blobs.get(small.getUrl!)!.type).toBe('application/zip');
    const placeholder = await urls.text(big.getUrl!);
    expect(placeholder).toContain('big.unitypackage');
    expect(placeholder).toMatch(/5 MB/);
    expect(placeholder).toContain(String(BLOB_STORE_MAX_BYTES + 1));

    // A repeated request is answered from the object-URL cache without reading the blob again.
    const read = vi.spyOn(getBlobStore(), 'get');
    const again = await options(app, assetId, versionId);
    expect(again.files.find((f) => f.id === smallId)!.getUrl).toBe(small.getUrl);
    expect(again.files.find((f) => f.id === bigId)!.getUrl).toBe(big.getUrl);
    expect(read).not.toHaveBeenCalled();
    read.mockRestore();
  });

  it('validates the query and the target', async () => {
    const app = await appForWrites({ timers: false });
    const v = await pubVersion(app);
    await expect(
      app.call('GET', '/downloads/options', { query: { assetId: 'a-mine-pub' } }),
    ).rejects.toSatisfy(status(400));
    await expect(options(app, 'a-mine-pub', 'v-nope')).rejects.toSatisfy(
      status(404, 'version.not_found'),
    );
    await expect(options(app, 'a-nope', v.id)).rejects.toSatisfy(status(404, 'version.not_found'));
    await expect(options(app, 'a-gone', 'x')).rejects.toSatisfy(status(404));
    // the version belongs to another asset
    await expect(options(app, 'a-fx-001', v.id)).rejects.toSatisfy(
      status(404, 'version.not_found'),
    );
  });

  it('non-privileged viewers: published versions only; foreign drafts are forbidden', async () => {
    const app = await appForWrites({ timers: false, meId: 'u-third' });
    const pub = (await storedOrThrow(app, 'a-fx-001')).versions[0]!;
    expect((await options(app, 'a-fx-001', pub.id)).files).toHaveLength(1);
    const draftV = (await storedOrThrow(app, 'a-other-draft')).versions[0]!;
    await expect(options(app, 'a-other-draft', draftV.id)).rejects.toSatisfy(
      status(403, 'auth.forbidden'),
    );
    // an unpublished new version of a published asset is not downloadable by others
    const a = await storedOrThrow(app, 'a-fx-001');
    await app.db.patch<AssetRecord>('assets', 'a-fx-001', {
      versions: [
        ...a.versions,
        { ...pub, id: 'v-unpub', semver: '2.0.0', publishedAt: null, isLatest: false },
      ],
    });
    await expect(options(app, 'a-fx-001', 'v-unpub')).rejects.toSatisfy(
      status(404, 'version.not_found'),
    );
  });

  it('the owner (or an admin) can fetch a draft', async () => {
    const app = await appForWrites({ timers: false });
    const v = await pubVersion(app, 'a-mine-draft');
    expect((await options(app, 'a-mine-draft', v.id)).files).toHaveLength(1);
  });
});

describe('POST /downloads', () => {
  it('records the download: counters, the requested file only, library auto-save once', async () => {
    const app = await appForWrites({ timers: false });
    const ev = recordEvents();
    const v = await pubVersion(app, 'a-fx-001');
    const before = await storedOrThrow(app, 'a-fx-001');
    const res = await download(app, {
      assetId: 'a-fx-001',
      versionId: v.id,
      fileId: v.files[0]!.id,
      source: 'WEB',
    });
    expect(res.files).toHaveLength(1);
    expect(res.files[0]!.getUrl).toMatch(/^blob:/);
    expect(res.files[0]!.id).toBe(v.files[0]!.id);

    const after = await storedOrThrow(app, 'a-fx-001');
    expect(after.totalDownloads).toBe(before.totalDownloads + 1);
    expect(after.totalSaves).toBe(before.totalSaves + 1);
    expect(await app.db.get<LibraryRecord>('library', 'a-fx-001')).toMatchObject({ hidden: false });
    expect(ev.events).toContainEqual({ type: 'assets.changed' });

    // second download: counted again, saved only once
    await download(app, {
      assetId: 'a-fx-001',
      versionId: v.id,
      fileId: v.files[0]!.id,
      source: 'UNITY',
    });
    const again = await storedOrThrow(app, 'a-fx-001');
    expect(again.totalDownloads).toBe(before.totalDownloads + 2);
    expect(again.totalSaves).toBe(before.totalSaves + 1);
    ev.stop();
  });

  it('without fileId every file of the version is returned and counted', async () => {
    const app = await appForWrites({ timers: false });
    const a = await storedOrThrow(app, 'a-fx-002');
    const v = a.versions[0]!;
    const extra = { ...v.files[0]!, id: 'f-extra', relativePath: 'extra.txt' };
    await app.db.patch<AssetRecord>('assets', 'a-fx-002', {
      versions: [{ ...v, files: [...v.files, extra], fileCount: 2 }],
    });
    const res = await download(app, { assetId: 'a-fx-002', versionId: v.id, source: 'WEB' });
    expect(res.files.map((f) => f.id)).toEqual([v.files[0]!.id, 'f-extra']);
    expect((await storedOrThrow(app, 'a-fx-002')).totalDownloads).toBe(a.totalDownloads + 2);
  });

  it('keeps a hidden library item hidden', async () => {
    const app = await appForWrites({ timers: false });
    const v = await pubVersion(app, 'a-fx-003');
    await app.db.put<LibraryRecord>('library', {
      id: 'a-fx-003',
      addedAt: '2026-01-01T00:00:00.000Z',
      hidden: true,
    });
    const saves = (await storedOrThrow(app, 'a-fx-003')).totalSaves;
    await download(app, { assetId: 'a-fx-003', versionId: v.id, source: 'WEB' });
    expect(await app.db.get<LibraryRecord>('library', 'a-fx-003')).toMatchObject({ hidden: true });
    expect((await storedOrThrow(app, 'a-fx-003')).totalSaves).toBe(saves);
  });

  it('adds to the analytics of an asset that has a record (today bucket, source, version, file)', async () => {
    const rec: AssetAnalyticsRecord = {
      id: 'an-a-mine-pub',
      kind: 'asset',
      assetId: 'a-mine-pub',
      endDate: '2026-03-30',
      downloads7d: 5,
      downloads30d: 9,
      detail: {
        daily: [1, 2, 3],
        byCountry: { ID: 6 },
        bySource: { WEB: 6 },
        byVersion: [{ versionId: 'x', downloads: 6 }],
        byFile: [{ fileId: 'y', downloads: 6 }],
      },
    };
    const app = await appForWrites({ timers: false }, { analytics: [rec] });
    app.ctx.now = () => new Date('2026-04-02T10:00:00.000Z');
    const v = await pubVersion(app);
    await download(app, {
      assetId: 'a-mine-pub',
      versionId: v.id,
      fileId: v.files[0]!.id,
      source: 'UNITY',
    });
    const after = (await app.db.get<AnalyticsRecord>(
      'analytics',
      'an-a-mine-pub',
    )) as AssetAnalyticsRecord;
    // end date moved to today (2026-04-02): two zero days (03-31, 04-01) and today's download
    expect(after.endDate).toBe('2026-04-02');
    expect(after.detail!.daily).toEqual([1, 2, 3, 0, 0, 1]);
    expect(after.detail!.bySource).toEqual({ WEB: 6, UNITY: 1 });
    expect(after.detail!.byCountry).toEqual({ ID: 6, unknown: 1 });
    expect(after.detail!.byVersion).toContainEqual({ versionId: v.id, downloads: 1 });
    expect(after.detail!.byFile).toContainEqual({ fileId: v.files[0]!.id, downloads: 1 });
    expect(after.downloads7d).toBe(6);
    expect(after.downloads30d).toBe(10);
    // a second one the same day lands in the same bucket
    await download(app, { assetId: 'a-mine-pub', versionId: v.id, source: 'WEB' });
    const again = (await app.db.get<AnalyticsRecord>(
      'analytics',
      'an-a-mine-pub',
    )) as AssetAnalyticsRecord;
    expect(again.detail!.daily).toEqual([1, 2, 3, 0, 0, 2]);
  });

  it('creates an analytics record for a persona asset that has none, never for others', async () => {
    const app = await appForWrites({ timers: false });
    const mine = await pubVersion(app);
    await download(app, { assetId: 'a-mine-pub', versionId: mine.id, source: 'WEB' });
    const rec = (await app.db.get<AnalyticsRecord>(
      'analytics',
      'an-a-mine-pub',
    )) as AssetAnalyticsRecord;
    expect(rec.detail!.daily).toHaveLength(90);
    expect(rec.detail!.daily[89]).toBe(1);
    expect(rec.detail!.daily.slice(0, 89).every((n) => n === 0)).toBe(true);

    const other = await pubVersion(app, 'a-fx-001');
    await download(app, { assetId: 'a-fx-001', versionId: other.id, source: 'WEB' });
    expect(await app.db.get('analytics', 'an-a-fx-001')).toBeUndefined();
  });

  it('validates the body', async () => {
    const app = await appForWrites({ timers: false });
    const v = await pubVersion(app);
    await expect(download(app, undefined)).rejects.toSatisfy(status(400));
    await expect(download(app, { assetId: 'a-mine-pub', versionId: v.id })).rejects.toSatisfy(
      status(400),
    );
    await expect(
      download(app, { assetId: 'a-mine-pub', versionId: v.id, source: 'CLI' }),
    ).rejects.toSatisfy(status(400));
    await expect(
      download(app, { assetId: 'a-mine-pub', versionId: v.id, fileId: 'f-nope', source: 'WEB' }),
    ).rejects.toSatisfy(status(404, 'file.not_found'));
    await expect(
      download(app, { assetId: 'a-mine-pub', versionId: 'v-nope', source: 'WEB' }),
    ).rejects.toSatisfy(status(404, 'version.not_found'));
  });

  it('refuses an infected version with av.infected and counts nothing', async () => {
    const app = await appForWrites({ timers: false });
    const a = await storedOrThrow(app, 'a-fx-001');
    await app.db.patch<AssetRecord>('assets', 'a-fx-001', {
      versions: [{ ...a.versions[0]!, avStatus: 'INFECTED' }],
    });
    await expect(
      download(app, { assetId: 'a-fx-001', versionId: a.versions[0]!.id, source: 'WEB' }),
    ).rejects.toSatisfy(status(403, 'av.infected'));
    expect((await storedOrThrow(app, 'a-fx-001')).totalDownloads).toBe(a.totalDownloads);
  });

  it('a foreign draft is forbidden', async () => {
    const app = await appForWrites({ timers: false, meId: 'u-third' });
    const v = (await storedOrThrow(app, 'a-other-draft')).versions[0]!;
    await expect(
      download(app, { assetId: 'a-other-draft', versionId: v.id, source: 'WEB' }),
    ).rejects.toSatisfy(status(403));
  });
});

describe('real seed smoke', () => {
  it('lists and downloads a seeded .txt link file with its generated content', async () => {
    const { createSeededTestApp } = await import('@/preview/test-utils');
    const app = await createSeededTestApp({ timers: false });
    const d = await app.call<{
      id: string;
      slug: string;
      versions: { id: string; files: { id: string; relativePath: string }[] }[];
    }>('GET', '/assets/ucupaint');
    const v = d.versions[0]!;
    const res = await options(app, d.id, v.id);
    expect(res.files[0]!.relativePath).toMatch(/\.txt$/);
    expect(res.files[0]!.getUrl).toMatch(/^blob:/);
    const content = await urls.text(res.files[0]!.getUrl!);
    expect(content).toMatch(/^Original asset page:\nhttps:\/\//);
    const posted = await download(app, {
      assetId: d.id,
      versionId: v.id,
      fileId: v.files[0]!.id,
      source: 'WEB',
    });
    expect(posted.files).toHaveLength(1);
  });
});

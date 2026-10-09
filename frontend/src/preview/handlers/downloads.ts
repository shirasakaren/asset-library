import type { DownloadOptions, DownloadOptionsFile, DownloadSource } from '@/lib/api/types';
import type { AssetFileRecord, AssetRecord, AssetVersionRecord, LibraryRecord } from '../records';
import { route, type PreviewContext } from '../router/router';
import { badRequest, forbidden, notFound } from '../router/errors';
import { getBlobStore } from '../uploads/blob-store';
import { objectUrlFor } from '../uploads/blob-url';
import { recordDownloads } from './analytics';
import { findAsset, getMe, normalizeReleaseNotes } from './helpers';
import { expiresAtIso, uploadMetaOf } from './upload-core';
import { serialized } from './write-queue';

/**
 * Downloads. `getUrl` of a file is a `blob:` object URL created on demand (cached per file, see
 * `blob-url.ts`): a seeded `.txt` link file gets its generated text, an uploaded file its stored
 * bytes, and an upload over 5 MB (which the demo did not keep) a short placeholder text. The
 * download popup turns the URL into a file named after `relativePath` (it sets `download=`).
 */

const SOURCES: readonly DownloadSource[] = ['WEB', 'UNITY', 'UNREAL'];
const OLDER_VERSIONS_LIMIT = 10;

const versionNotFound = (id: string) =>
  notFound(`Version ${id} not found.`, { code: 'version.not_found' });

const text = (s: string) => new Blob([s], { type: 'text/plain;charset=utf-8' });

function placeholderFor(file: AssetFileRecord, why: 'too-big' | 'gone'): Blob {
  const lines = [
    `${file.relativePath}`,
    '',
    why === 'too-big'
      ? `This file was uploaded in the static demo, but it is over 5 MB, so its contents were not kept.`
      : 'This file was uploaded in the static demo, but its contents are no longer stored (the demo data was reset).',
    `Size when uploaded: ${file.bytes} bytes.`,
    '',
    'Nothing here is real package data.',
    '',
  ];
  return text(lines.join('\n'));
}

/** The Blob a download of `file` delivers. */
async function contentOf(file: AssetFileRecord): Promise<Blob | null> {
  const content = (file.meta as { content?: unknown } | null | undefined)?.content;
  if (typeof content === 'string') return text(content);
  const upload = uploadMetaOf(file);
  if (!upload) return null;
  const entry = await getBlobStore().get(upload.blobId);
  if (entry?.blob) return entry.blob;
  return placeholderFor(file, upload.stored ? 'gone' : 'too-big');
}

async function toDownloadFile(
  ctx: PreviewContext,
  file: AssetFileRecord,
): Promise<DownloadOptionsFile> {
  const key = `file:${file.id}`;
  const blob = await contentOf(file);
  const getUrl = blob ? objectUrlFor(key, blob) : null;
  return {
    id: file.id,
    relativePath: file.relativePath,
    kind: file.kind,
    bytes: file.bytes,
    getUrl,
    expiresAt: getUrl ? expiresAtIso(ctx) : null,
  };
}

interface Target {
  asset: AssetRecord;
  version: AssetVersionRecord;
}

/**
 * The asset and version a download request names. Like the backend: an unknown version is a 404
 * `version.not_found` (also when the asset is unknown or deleted), an asset that is not PUBLISHED
 * is only for its owner and admins (403). Everybody else only gets published versions.
 */
async function resolveTarget(
  ctx: PreviewContext,
  assetId: unknown,
  versionId: unknown,
): Promise<Target> {
  if (typeof assetId !== 'string' || !assetId || typeof versionId !== 'string' || !versionId) {
    throw badRequest('assetId and versionId are required.', {
      fields: [
        ...(typeof assetId === 'string' && assetId
          ? []
          : [{ path: 'assetId', code: 'required', message: 'assetId is required.' }]),
        ...(typeof versionId === 'string' && versionId
          ? []
          : [{ path: 'versionId', code: 'required', message: 'versionId is required.' }]),
      ],
    });
  }
  const asset = findAsset(await ctx.db.list<AssetRecord>('assets'), assetId);
  const version = asset?.versions.find((v) => v.id === versionId);
  if (!asset || !version) throw versionNotFound(versionId);
  const me = await getMe(ctx);
  const privileged = me.isAdmin || asset.ownerId === me.id;
  if (asset.status !== 'PUBLISHED' && !privileged) {
    throw forbidden('Asset is not available for download.', { code: 'auth.forbidden' });
  }
  if (!privileged && !version.publishedAt) throw versionNotFound(versionId);
  return { asset, version };
}

async function toResponse(
  ctx: PreviewContext,
  { asset, version }: Target,
  files: AssetFileRecord[],
): Promise<DownloadOptions> {
  const older = asset.versions
    .filter((v) => v.id !== version.id && v.publishedAt !== null)
    .sort((a, b) =>
      a.publishedAt! < b.publishedAt! ? 1 : a.publishedAt! > b.publishedAt! ? -1 : 0,
    )
    .slice(0, OLDER_VERSIONS_LIMIT);
  return {
    asset: { id: asset.id, title: asset.title },
    version: {
      id: version.id,
      semver: version.semver,
      releaseNotes: normalizeReleaseNotes(version.releaseNotes),
    },
    files: await Promise.all(files.map((f) => toDownloadFile(ctx, f))),
    olderVersions: older.map((v) => ({ id: v.id, semver: v.semver, publishedAt: v.publishedAt })),
  };
}

route('GET', '/downloads/options', async (req, ctx): Promise<DownloadOptions> => {
  const target = await resolveTarget(
    ctx,
    req.query.get('assetId') ?? undefined,
    req.query.get('versionId') ?? undefined,
  );
  return toResponse(ctx, target, target.version.files);
});

/** The first download adds the asset to the library, without touching `hidden` (backend behaviour). */
async function autoSave(ctx: PreviewContext, asset: AssetRecord): Promise<void> {
  if (asset.status !== 'PUBLISHED') return;
  if (await ctx.db.get<LibraryRecord>('library', asset.id)) return;
  await ctx.db.put<LibraryRecord>('library', {
    id: asset.id,
    addedAt: ctx.now().toISOString(),
    hidden: false,
  });
  await ctx.db.patch<AssetRecord>('assets', asset.id, { totalSaves: asset.totalSaves + 1 });
}

/**
 * Records a download of one file (or, without `fileId`, of every file of the version): the asset's
 * `totalDownloads` goes up by the number of files, the owner analytics get today's bucket
 * (`analytics.ts`), the asset is auto-saved to the library, and the response carries the URLs of
 * the requested files. An infected version is refused (`av.infected`) before anything is counted.
 */
route('POST', '/downloads', (req, ctx) =>
  serialized(async (): Promise<DownloadOptions> => {
    const body = (typeof req.body === 'object' && req.body !== null ? req.body : {}) as Record<
      string,
      unknown
    >;
    const source = body.source as DownloadSource;
    if (!SOURCES.includes(source)) {
      throw badRequest(`source must be one of ${SOURCES.join(', ')}.`, {
        fields: [
          {
            path: 'source',
            code: 'invalid',
            message: `source must be one of ${SOURCES.join(', ')}.`,
          },
        ],
      });
    }
    if (body.fileId !== undefined && body.fileId !== null && typeof body.fileId !== 'string') {
      throw badRequest('fileId must be a string.', {
        fields: [{ path: 'fileId', code: 'invalid', message: 'fileId must be a string.' }],
      });
    }
    const target = await resolveTarget(ctx, body.assetId, body.versionId);
    const { asset, version } = target;
    const files = body.fileId ? version.files.filter((f) => f.id === body.fileId) : version.files;
    if (body.fileId && files.length === 0) {
      throw notFound(`File ${String(body.fileId)} not in this version.`, {
        code: 'file.not_found',
      });
    }
    if (version.avStatus === 'INFECTED') {
      throw forbidden('This version was flagged by the virus scan and cannot be downloaded.', {
        code: 'av.infected',
      });
    }

    await ctx.db.patch<AssetRecord>('assets', asset.id, {
      totalDownloads: asset.totalDownloads + files.length,
    });
    await recordDownloads(ctx, { asset, version, files, source });
    await autoSave(ctx, asset);
    ctx.emit({ type: 'assets.changed' });
    return toResponse(ctx, target, files);
  }),
);

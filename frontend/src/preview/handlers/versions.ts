import type {
  CompatibilityRow,
  LocaleCode,
  RenderPipeline,
  TargetPlatform,
  TipTapDoc,
  VersionSummary,
} from '@/lib/api/types';
import type { AssetRecord, AssetVersionRecord, LibraryRecord } from '../records';
import { route, type PreviewContext } from '../router/router';
import { badRequest, conflict } from '../router/errors';
import { resolveVisible } from './assets-read';
import { docHasContent, isoSeconds, loadWritable } from './asset-write-core';
import { getMe } from './helpers';
import { createNotification } from './notifications';
import { SEMVER_REGEX, toProblemFields } from './publish-checklist';
import { validateLiteTipTap } from './tiptap-validate';
import { scheduleAnalysis } from './version-analysis';
import { compareSemver, markLatest } from './version-core';
import { mutateVersion, versionNotFound } from './version-files';
import { serialized } from './write-queue';

// Binding exports for the upload / download handlers.
export { scheduleAnalysis, SCHEDULED_ANALYSIS_MS } from './version-analysis';
export {
  attachFileToVersion,
  removeFileFromVersion,
  mutateVersion,
  type NewVersionFile,
} from './version-files';
export { recomputeVersionTotals } from './version-core';
export { detectFileKind } from './file-kinds';

const changed = (ctx: PreviewContext) => ctx.emit({ type: 'assets.changed' });

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const invalidField = (path: string, message: string, code = 'invalid') =>
  badRequest(message, { fields: [{ path, code, message }] });

const semverInvalid = (message: string) =>
  badRequest(message, {
    code: 'version.semver_invalid',
    fields: [{ path: 'semver', code: 'semver.invalid', message }],
  });

/** `releaseNotes` of a request: `{ en?, id? }` of lite TipTap docs; `null` when nothing is left. */
function parseReleaseNotes(raw: unknown): AssetVersionRecord['releaseNotes'] {
  if (!isObject(raw))
    throw invalidField('releaseNotes', 'releaseNotes must be an object keyed by locale.');
  const out: Partial<Record<LocaleCode, TipTapDoc>> = {};
  for (const locale of ['en', 'id'] as const) {
    const doc = raw[locale];
    if (!doc) continue;
    const clean = validateLiteTipTap(doc);
    if (docHasContent(clean)) out[locale] = clean;
  }
  // Stored the way the backend does (`{ en?, id? }`), which `versions-list.tsx` reads.
  return Object.keys(out).length ? out : null;
}

const toSummary = (v: AssetVersionRecord): VersionSummary => ({
  id: v.id,
  semver: v.semver,
  isLatest: v.isLatest,
  analysisStatus: v.analysisStatus,
  publishedAt: v.publishedAt,
  bytesTotal: v.bytesTotal,
  fileCount: v.fileCount,
  createdAt: v.createdAt,
});

/** Newest created first (ties: the one added last). */
const newestFirst = (versions: AssetVersionRecord[]) =>
  versions
    .map((v, i) => ({ v, i }))
    .sort((a, b) =>
      a.v.createdAt < b.v.createdAt ? 1 : a.v.createdAt > b.v.createdAt ? -1 : b.i - a.i,
    )
    .map((x) => x.v);

/**
 * Owners and admins see every version; everybody else only published versions whose analysis
 * is READY (the download popup lists these). Invisible assets are a 404.
 */
route('GET', '/assets/{assetId}/versions', async (req, ctx): Promise<VersionSummary[]> => {
  const { asset } = await resolveVisible(req.params.assetId!, ctx);
  const viewer = await getMe(ctx);
  const privileged = viewer.isAdmin || asset.ownerId === viewer.id;
  return newestFirst(asset.versions)
    .filter((v) => privileged || (v.publishedAt !== null && v.analysisStatus === 'READY'))
    .map(toSummary);
});

/**
 * New DRAFT version (`{ id }`). `semver` must be MAJOR.MINOR.PATCH (400 `version.semver_invalid`),
 * not exist yet (409 `version.duplicate`) and, unlike the backend, be higher than every existing
 * version (400 `version.semver_invalid`, what `new-version-form.tsx` also enforces). It is not
 * the latest until it is published.
 */
route('POST', '/assets/{assetId}/versions', (req, ctx) =>
  serialized(async () => {
    if (!isObject(req.body)) throw invalidField('body', 'The request body must be a JSON object.');
    const { semver, releaseNotes } = req.body;
    if (typeof semver !== 'string' || !SEMVER_REGEX.test(semver)) {
      throw semverInvalid('semver must look like MAJOR.MINOR.PATCH.');
    }
    const notes =
      releaseNotes === undefined || releaseNotes === null ? null : parseReleaseNotes(releaseNotes);
    const { asset } = await loadWritable(ctx, req.params.assetId!);

    if (asset.versions.some((v) => v.semver === semver)) {
      throw conflict(`Version ${semver} already exists.`, { code: 'version.duplicate' });
    }
    const highest = asset.versions.reduce<string | null>(
      (best, v) => (best === null || compareSemver(v.semver, best) > 0 ? v.semver : best),
      null,
    );
    if (highest !== null && compareSemver(semver, highest) < 0) {
      throw semverInvalid(`Version ${semver} must be higher than ${highest}.`);
    }

    const now = isoSeconds(ctx);
    const version: AssetVersionRecord = {
      id: ctx.newId('v'),
      semver,
      releaseNotes: notes,
      publishedAt: null,
      isLatest: false,
      analysisStatus: 'PENDING',
      bytesTotal: '0',
      fileCount: 0,
      files: [],
      compatibility: [],
      dependencies: [],
      requiresEmptyProject: asset.versions.some((v) => v.requiresEmptyProject),
      createdAt: now,
      avStatus: 'CLEAN',
      avAcknowledgedAt: null,
    };
    await ctx.db.patch<AssetRecord>('assets', asset.id, {
      versions: [...asset.versions, version],
      updatedAt: now,
    });
    changed(ctx);
    return { id: version.id };
  }),
);

/** Release notes (any time) and semver (drafts only: 400 `version.cannot_change_semver` once published). */
route('PATCH', '/assets/{assetId}/versions/{vid}', async (req, ctx) => {
  if (!isObject(req.body)) throw invalidField('body', 'The request body must be a JSON object.');
  const { releaseNotes, semver } = req.body;
  if (semver !== undefined && typeof semver !== 'string') {
    throw invalidField('semver', 'semver must be a string.');
  }
  const notes = releaseNotes === undefined ? undefined : parseReleaseNotes(releaseNotes);

  await mutateVersion(ctx, req.params.assetId!, req.params.vid!, (version, asset) => {
    let touched = false;
    if (semver !== undefined && semver !== version.semver) {
      if (version.publishedAt) {
        throw badRequest('Semver is locked once a version is published.', {
          code: 'version.cannot_change_semver',
        });
      }
      if (!SEMVER_REGEX.test(semver))
        throw semverInvalid('semver must look like MAJOR.MINOR.PATCH.');
      if (asset.versions.some((v) => v.id !== version.id && v.semver === semver)) {
        throw conflict(`Version ${semver} already exists.`, { code: 'version.duplicate' });
      }
      version.semver = semver;
      touched = true;
    }
    if (notes !== undefined) {
      version.releaseNotes = notes;
      touched = true;
    }
    if (!touched) return false;
  });
  return undefined;
});

/**
 * A saved asset got a new version from someone else: the persona is told (`VERSION_PUBLISHED`,
 * payload keys as in the seed). Nothing when the persona published it herself or does not have
 * the asset in her library. Returns the notification id, if one was created.
 */
export async function notifyVersionPublished(
  ctx: PreviewContext,
  asset: Pick<AssetRecord, 'id' | 'slug' | 'title'>,
  version: Pick<AssetVersionRecord, 'id' | 'semver'>,
  publisherId: string,
): Promise<string | undefined> {
  if (publisherId === ctx.meId) return undefined;
  if (!(await ctx.db.get<LibraryRecord>('library', asset.id))) return undefined;
  const n = await createNotification(ctx, 'VERSION_PUBLISHED', {
    assetId: asset.id,
    assetSlug: asset.slug,
    assetTitle: asset.title,
    versionId: version.id,
    semver: version.semver,
    versionLabel: `v${version.semver}`,
  });
  return n.id;
}

/**
 * Publishes a version: it needs at least one file, becomes the single `isLatest` row (the
 * previous one is flipped in the same write) and gets `publishedAt` unless it already had one.
 * Last published wins, like the backend: publishing 1.1.0 after 1.2.0 makes 1.1.0 the latest.
 * Does not touch the asset's status.
 */
route('POST', '/assets/{assetId}/versions/{vid}/publish', (req, ctx) =>
  serialized(async () => {
    const { asset } = await loadWritable(ctx, req.params.assetId!);
    const version = asset.versions.find((v) => v.id === req.params.vid);
    if (!version) throw versionNotFound(req.params.vid!);
    if (version.files.length === 0) {
      throw badRequest('Version has no files: upload at least one before publishing.', {
        code: 'asset.publish_blocked',
        fields: toProblemFields([
          {
            field: 'version.files',
            code: 'version.empty',
            message: 'Upload at least one file in this version.',
            severity: 'error',
          },
        ]),
      });
    }
    const now = isoSeconds(ctx);
    await ctx.db.patch<AssetRecord>('assets', asset.id, {
      versions: markLatest(asset.versions, version.id, now),
      updatedAt: now,
    });
    changed(ctx);
    if (!version.publishedAt) {
      await notifyVersionPublished(ctx, asset, version, ctx.meId);
    }
    return undefined;
  }),
);

/** Marks the version `PENDING` again and runs the (simulated) analysis; a version without files is left alone. */
route('POST', '/assets/{assetId}/versions/{vid}/reanalyze', async (req, ctx) => {
  const asset = await mutateVersion(ctx, req.params.assetId!, req.params.vid!, (version) => {
    if (version.files.length === 0) return false;
    version.analysisStatus = 'PENDING';
  });
  const version = asset.versions.find((v) => v.id === req.params.vid);
  if (version && version.files.length > 0) scheduleAnalysis(ctx, asset.id, version.id);
  return undefined;
});

const PIPELINES: readonly RenderPipeline[] = [
  'URP',
  'HDRP',
  'SRP',
  'BUILT_IN',
  'LUMEN',
  'NANITE',
  'PATH_TRACING',
  'EEVEE',
  'CYCLES',
  'NA',
];
const TARGETS: readonly TargetPlatform[] = [
  'WINDOWS',
  'MAC',
  'LINUX',
  'IOS',
  'ANDROID',
  'CONSOLE',
  'WEB',
  'VR',
];
const MAX_ROWS = 20;

/** `{ rows }` of the compatibility body (`SetCompatibilityDto`), with the pipelines and targets checked against the known sets. */
function parseCompatibility(body: unknown): CompatibilityRow[] {
  const fields: { path: string; code: string; message: string }[] = [];
  const add = (path: string, message: string, code = 'invalid') =>
    fields.push({ path, code, message });
  const rows = isObject(body) ? body.rows : undefined;
  if (!Array.isArray(rows)) {
    add('rows', 'rows must be an array.');
  } else if (rows.length > MAX_ROWS) {
    add('rows', `At most ${MAX_ROWS} rows.`, 'too_many');
  } else {
    rows.forEach((row, i) => {
      const p = `rows[${i}]`;
      if (!isObject(row)) return add(p, 'Each row must be an object.');
      if (typeof row.engineVersion !== 'string' || row.engineVersion.length > 40) {
        add(`${p}.engineVersion`, 'engineVersion must be a string of at most 40 characters.');
      }
      const { renderPipelines: rp, targets } = row;
      if (
        rp !== undefined &&
        rp !== null &&
        (!Array.isArray(rp) || rp.some((x) => !PIPELINES.includes(x as RenderPipeline)))
      ) {
        add(`${p}.renderPipelines`, `renderPipelines must be a list of ${PIPELINES.join(', ')}.`);
      }
      if (
        !Array.isArray(targets) ||
        targets.length === 0 ||
        targets.some((x) => !TARGETS.includes(x as TargetPlatform))
      ) {
        add(`${p}.targets`, `targets must be a non-empty list of ${TARGETS.join(', ')}.`);
      }
    });
  }
  if (fields.length > 0) throw badRequest('Invalid compatibility rows.', { fields });
  return (rows as Record<string, unknown>[]).map((r) => ({
    engineVersion: r.engineVersion as string,
    renderPipelines: ((r.renderPipelines as RenderPipeline[] | null | undefined) ?? []).slice(),
    targets: (r.targets as TargetPlatform[]).slice(),
  }));
}

/** Replaces the whole engine/version/pipeline/target matrix of a version (the wizard sends `{ rows }`). */
route('POST', '/assets/{assetId}/versions/{vid}/compatibility', async (req, ctx) => {
  const rows = parseCompatibility(req.body);
  await mutateVersion(ctx, req.params.assetId!, req.params.vid!, (version) => {
    version.compatibility = rows;
  });
  return undefined;
});

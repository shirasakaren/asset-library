import type { AssetRecord, CategoryRecord, LicenseRecord, TagRecord } from '../records';
import type { PreviewContext } from '../router/router';
import { badRequest, conflict, notFound } from '../router/errors';
import { parseUpdate } from './asset-input';
import {
  applyTranslations,
  commitTags,
  isoSeconds,
  loadWritable,
  planTags,
  resolvePreviewMedia,
  takenSlugs,
  type TagPlan,
  type Writable,
} from './asset-write-core';
import { wizardVersion } from './version-core';

const blocked = (message: string) => badRequest(message, { code: 'asset.publish_blocked' });

/** Prerelease suffixes are accepted here (the backend's looser PATCH regex); the checklist is strict. */
const PATCH_SEMVER = /^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/;

export interface AssetUpdateResult {
  /** The target as loaded (before the write), with the viewer. */
  writable: Writable;
  /** Names of what changed (`title`, `category`, `tags`, ...); empty when nothing was written. */
  changed: string[];
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Audit vocabulary of the changed columns (what the seed's `asset.admin_edit` rows list). */
function changedFields(before: AssetRecord, patch: Partial<AssetRecord>): string[] {
  const out = new Set<string>();
  if ('title' in patch) out.add('title');
  if ('slug' in patch) out.add('slug');
  if ('engine' in patch) out.add('engine');
  if ('categoryId' in patch) out.add('category');
  if ('licenseId' in patch) out.add('license');
  if ('tagIds' in patch) out.add('tags');
  if ('previewMedia' in patch) out.add('previewMedia');
  if ('versions' in patch) out.add('version');
  if (
    ('shortDescription' in patch && patch.shortDescription !== before.shortDescription) ||
    ('shortDescriptionI18n' in patch &&
      !same(patch.shortDescriptionI18n, before.shortDescriptionI18n))
  ) {
    out.add('shortDescription');
  }
  if ('longDescription' in patch && !same(patch.longDescription, before.longDescription)) {
    out.add('longDescription');
  }
  return [...out];
}

/**
 * Partial update (`UpdateAssetDto`): everything is validated first and then written in one go,
 * so a rejected request changes nothing. `semver` and `requiresEmptyProject` belong to the
 * versions; `slug`, `engine` and the latest `semver` are locked after publish. Shared by
 * `PATCH /assets/{id}` and `PATCH /admin/assets/{id}`: the target is the owner's or any asset for
 * an admin (`loadWritable`). Call it INSIDE `serialized(...)`.
 */
export async function applyAssetUpdate(
  ctx: PreviewContext,
  idOrSlug: string,
  rawBody: unknown,
): Promise<AssetUpdateResult> {
  const input = parseUpdate(rawBody);
  const writable = await loadWritable(ctx, idOrSlug);
  const { asset, assets } = writable;
  const patch: Partial<AssetRecord> = {};
  let versions = asset.versions;

  if (input.title !== undefined && input.title !== asset.title) {
    patch.title = input.title;
    patch.titleI18n = { en: input.title, id: input.title };
  }
  if (input.slug !== undefined && input.slug !== asset.slug) {
    if (asset.status === 'PUBLISHED') throw blocked('Slug is locked once an asset is published.');
    if (takenSlugs(assets, asset.id).has(input.slug)) {
      throw conflict(`Slug "${input.slug}" is already taken.`, { code: 'asset.slug_taken' });
    }
    patch.slug = input.slug;
  }
  if (input.engine !== undefined && input.engine !== asset.engine) {
    if (asset.status === 'PUBLISHED') throw blocked('Engine is locked once an asset is published.');
    patch.engine = input.engine;
  }
  if (input.categoryId) {
    if (!(await ctx.db.get<CategoryRecord>('categories', input.categoryId))) {
      throw notFound(`Category ${input.categoryId} not found.`, { code: 'category.not_found' });
    }
    if (input.categoryId !== asset.categoryId) patch.categoryId = input.categoryId;
  }
  if (input.licenseId) {
    if (!(await ctx.db.get<LicenseRecord>('licenses', input.licenseId))) {
      throw notFound(`License ${input.licenseId} not found.`, { code: 'license.not_found' });
    }
    if (input.licenseId !== asset.licenseId) patch.licenseId = input.licenseId;
  }
  if (input.translations) {
    Object.assign(patch, applyTranslations(asset, input.translations));
  }
  if (input.previewMedia) {
    patch.previewMedia = resolvePreviewMedia(input.previewMedia, asset.previewMedia);
  }

  // The wizard sends the version fields with the asset's. `semver` goes to the latest version
  // row; `requiresEmptyProject` is an asset-level flag in the backend, so every version gets it.
  const latest = wizardVersion(versions);
  if (input.semver !== undefined && latest && input.semver !== latest.semver) {
    if (latest.publishedAt) throw blocked('Semver is locked once a version is published.');
    if (!PATCH_SEMVER.test(input.semver)) {
      throw blocked(`"${input.semver}" is not a valid semver string.`);
    }
    if (versions.some((v) => v.id !== latest.id && v.semver === input.semver)) {
      throw conflict(`Version ${input.semver} already exists for this asset.`, {
        code: 'version.duplicate',
      });
    }
    versions = versions.map((v) => (v.id === latest.id ? { ...v, semver: input.semver! } : v));
  }
  if (
    input.requiresEmptyProject !== undefined &&
    versions.some((v) => v.requiresEmptyProject !== input.requiresEmptyProject)
  ) {
    versions = versions.map((v) => ({ ...v, requiresEmptyProject: input.requiresEmptyProject! }));
  }
  if (versions !== asset.versions) patch.versions = versions;

  let tagPlan: TagPlan | undefined;
  if (input.tags) {
    tagPlan = planTags(ctx, input.tags, await ctx.db.list<TagRecord>('tags'), isoSeconds(ctx));
    const unchanged =
      tagPlan.tagIds.length === asset.tagIds.length &&
      tagPlan.tagIds.every((id, i) => id === asset.tagIds[i]);
    if (!unchanged) patch.tagIds = tagPlan.tagIds;
    else tagPlan = undefined;
  }

  if (Object.keys(patch).length === 0) return { writable, changed: [] };
  const fields = changedFields(asset, patch);
  const changed = fields.length > 0 ? fields : ['description'];
  patch.updatedAt = isoSeconds(ctx);
  if (tagPlan) await commitTags(ctx, tagPlan, asset.tagIds);
  await ctx.db.patch<AssetRecord>('assets', asset.id, patch);
  ctx.emit({ type: 'assets.changed' });
  return { writable, changed };
}

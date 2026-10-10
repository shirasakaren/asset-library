import type { AdminCategory } from '@/lib/api/admin-types';
import type { AssetRecord, CategoryRecord } from '../../records';
import { conflict, notFound } from '../../router/errors';
import type { PreviewContext } from '../../router/router';
import { IMAGE_CAPS } from '@/lib/upload/image-caps';
import { BLOB_STORE_MAX_BYTES } from '../../uploads/blob-store';
import { recordAudit } from '../audit-core';
import {
  expiresAtIso,
  imageTooLarge,
  invalid,
  isObject,
  newUploadId,
  parseBytes,
  parseString,
  previewPutUrl,
} from '../upload-core';
import { serialized } from '../write-queue';
import { adminRoute, cmpStr } from './common';
import {
  asBody,
  Problems,
  readBoolean,
  readCount,
  readI18n,
  readOrderedIds,
  readString,
  SLUG_MAX,
  SLUG_REGEX,
  slugify,
} from './input';
import { renumber } from './ordering';

const NAME_MAX = 140;
const ICON_KEY_MAX = 512;

const categoryNotFound = (id: string) =>
  notFound(`Category ${id} not found.`, { code: 'category.not_found' });
const inUse = (message: string) => conflict(message, { code: 'category.in_use' });

/** Active first, then by sort order (the backend's `isActive desc, sortOrder asc`). */
const activeFirst = (a: CategoryRecord, b: CategoryRecord) =>
  Number(b.isActive) - Number(a.isActive) || a.sortOrder - b.sortOrder || cmpStr(a.id, b.id);

/** `AdminCategory`. `iconKey` is a decorative icon name in the demo, so `iconUrl` is always null. */
function toAdmin(c: CategoryRecord, assetCount: number): AdminCategory {
  return {
    id: c.id,
    slug: c.slug,
    name: { en: c.name.en, id: c.name.id },
    iconKey: c.iconKey,
    iconUrl: null,
    sortOrder: c.sortOrder,
    isActive: c.isActive,
    assetCount,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

/** Non-deleted assets per category (what the admin list shows). */
const countByCategory = (assets: readonly AssetRecord[]): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const a of assets) {
    if (a.status !== 'DELETED') counts.set(a.categoryId, (counts.get(a.categoryId) ?? 0) + 1);
  }
  return counts;
};

async function viewOf(ctx: PreviewContext, id: string): Promise<AdminCategory> {
  const [row, assets] = await Promise.all([
    ctx.db.get<CategoryRecord>('categories', id),
    ctx.db.list<AssetRecord>('assets'),
  ]);
  return toAdmin(row!, countByCategory(assets).get(id) ?? 0);
}

/** Every category, active and inactive, with the number of non-deleted assets in it. */
adminRoute('GET', '/admin/categories', async (_req, ctx): Promise<AdminCategory[]> => {
  const [rows, assets] = await Promise.all([
    ctx.db.list<CategoryRecord>('categories'),
    ctx.db.list<AssetRecord>('assets'),
  ]);
  const counts = countByCategory(assets);
  return rows.sort(activeFirst).map((c) => toAdmin(c, counts.get(c.id) ?? 0));
});

/**
 * Creates a category: `{ slug?, name: { en, id }, iconKey?, sortOrder?, isActive? }`. The slug
 * (kebab-case, <= 80) defaults to the slugified English name; a slug that exists is a 409
 * `category.in_use` (the backend's code for it). `sortOrder` defaults to the end. The record id is
 * `cat-<slug>`, or a generated one when that is taken (a renamed category keeps its old id).
 * Audit `category.create { slug }`.
 */
adminRoute('POST', '/admin/categories', (req, ctx) => {
  const body = asBody(req.body);
  const problems = new Problems();
  const name = readI18n(body, 'name', problems, {
    requireBoth: true,
    nonEmpty: ['en'],
    max: NAME_MAX,
  });
  let slug = readString(body, 'slug', problems, { max: SLUG_MAX }) ?? undefined;
  if (slug === undefined && name?.en) slug = slugify(name.en);
  if ((!slug || !SLUG_REGEX.test(slug)) && !problems.list.some((p) => p.path === 'slug')) {
    problems.add('slug', 'invalid', 'slug must be lowercase kebab-case.');
  }
  const iconKey = readString(body, 'iconKey', problems, { max: ICON_KEY_MAX });
  const sortOrder = readCount(body, 'sortOrder', problems);
  const isActive = readBoolean(body, 'isActive', problems);
  problems.check('Invalid category.');

  return serialized(async () => {
    const rows = await ctx.db.list<CategoryRecord>('categories');
    if (rows.some((c) => c.slug === slug)) throw inUse(`Category slug "${slug}" already exists.`);
    const now = ctx.now().toISOString();
    const wanted = `cat-${slug}`;
    const row = await ctx.db.put<CategoryRecord>('categories', {
      id: rows.some((c) => c.id === wanted) ? ctx.newId('cat') : wanted,
      slug: slug!,
      name: { en: name!.en!, id: name!.id ?? '' },
      iconKey: iconKey ?? null,
      sortOrder: sortOrder ?? rows.reduce((max, c) => Math.max(max, c.sortOrder), -1) + 1,
      isActive: isActive ?? true,
      createdAt: now,
      updatedAt: now,
    });
    await recordAudit(ctx, {
      action: 'category.create',
      subjectType: 'Category',
      subjectId: row.id,
      metadata: { slug: row.slug },
    });
    ctx.emit({ type: 'assets.changed' });
    return viewOf(ctx, row.id);
  });
});

/**
 * Partial update: `slug` (unique, else 409 `category.in_use`), `name` (per language, the other
 * keeps its text), `iconKey` (null clears it), `sortOrder`, `isActive`. Only values that differ are
 * written; audit `category.update { fields }` lists them, and a patch that changes nothing writes and
 * audits nothing. Renames reach `/categories`, `/discover` and every asset page at once because
 * those read the record.
 */
adminRoute('PATCH', '/admin/categories/{id}', (req, ctx) => {
  const body = asBody(req.body);
  const problems = new Problems();
  const slug = readString(body, 'slug', problems, { max: SLUG_MAX }) ?? undefined;
  if (
    slug !== undefined &&
    !SLUG_REGEX.test(slug) &&
    !problems.list.some((p) => p.path === 'slug')
  ) {
    problems.add('slug', 'invalid', 'slug must be lowercase kebab-case.');
  }
  const name = readI18n(body, 'name', problems, { nonEmpty: ['en'], max: NAME_MAX });
  const iconKey = readString(body, 'iconKey', problems, { nullable: true, max: ICON_KEY_MAX });
  const sortOrder = readCount(body, 'sortOrder', problems);
  const isActive = readBoolean(body, 'isActive', problems);
  problems.check('Invalid category.');

  return serialized(async () => {
    const id = req.params.id!;
    const row = await ctx.db.get<CategoryRecord>('categories', id);
    if (!row) throw categoryNotFound(id);
    const patch: Partial<CategoryRecord> = {};
    const fields: string[] = [];
    if (slug !== undefined && slug !== row.slug) {
      const rows = await ctx.db.list<CategoryRecord>('categories');
      if (rows.some((c) => c.slug === slug)) throw inUse(`Slug "${slug}" is taken.`);
      patch.slug = slug;
      fields.push('slug');
    }
    if (name) {
      const merged = { en: name.en ?? row.name.en, id: name.id ?? row.name.id };
      if (merged.en !== row.name.en || merged.id !== row.name.id) {
        patch.name = merged;
        fields.push('name');
      }
    }
    if (iconKey !== undefined && (iconKey || null) !== row.iconKey) {
      patch.iconKey = iconKey || null;
      fields.push('iconKey');
    }
    if (sortOrder !== undefined && sortOrder !== row.sortOrder) {
      patch.sortOrder = sortOrder;
      fields.push('sortOrder');
    }
    if (isActive !== undefined && isActive !== row.isActive) {
      patch.isActive = isActive;
      fields.push('isActive');
    }
    if (fields.length > 0) {
      await ctx.db.patch<CategoryRecord>('categories', id, {
        ...patch,
        updatedAt: ctx.now().toISOString(),
      });
      await recordAudit(ctx, {
        action: 'category.update',
        subjectType: 'Category',
        subjectId: id,
        metadata: { fields },
      });
      ctx.emit({ type: 'assets.changed' });
    }
    return viewOf(ctx, id);
  });
});

/**
 * Deletes a category nothing references: 409 `category.in_use` while ANY asset (soft-deleted ones
 * included, as in the backend: restoring one would otherwise point at nothing) still has it.
 * Audit `category.delete { slug }`.
 */
adminRoute('DELETE', '/admin/categories/{id}', (req, ctx) =>
  serialized(async () => {
    const id = req.params.id!;
    const [row, assets] = await Promise.all([
      ctx.db.get<CategoryRecord>('categories', id),
      ctx.db.list<AssetRecord>('assets'),
    ]);
    if (!row) throw categoryNotFound(id);
    const usage = assets.filter((a) => a.categoryId === id).length;
    if (usage > 0) {
      throw inUse(`Category has ${usage} asset(s) - reassign them before deleting.`);
    }
    await ctx.db.remove('categories', id);
    await recordAudit(ctx, {
      action: 'category.delete',
      subjectType: 'Category',
      subjectId: id,
      metadata: { slug: row.slug },
    });
    ctx.emit({ type: 'assets.changed' });
    return undefined;
  }),
);

/**
 * `{ orderedIds }`: distinct existing category ids (404 `category.not_found` for an unknown one,
 * nothing written then). They take sort orders 0..n-1 in that order; categories that are not listed
 * follow. Audit `category.reorder { order }` on the first id.
 */
adminRoute('POST', '/admin/categories/reorder', (req, ctx) => {
  const orderedIds = readOrderedIds(req.body);
  return serialized(async () => {
    const rows = (await ctx.db.list<CategoryRecord>('categories')).sort(activeFirst);
    await renumber(ctx, 'categories', rows, orderedIds, categoryNotFound);
    await recordAudit(ctx, {
      action: 'category.reorder',
      subjectType: 'Category',
      subjectId: orderedIds[0]!,
      metadata: { order: orderedIds },
    });
    ctx.emit({ type: 'assets.changed' });
    return undefined;
  });
});

/**
 * Presigned-PUT stand-in for a category icon (<= 256 KB, images only). Nothing in the UI uploads an
 * icon, and `iconKey` is a decorative icon name in the demo, so the key is only handed out.
 */
adminRoute('POST', '/admin/categories/icon-uploads/initiate', (req, ctx) => {
  if (!isObject(req.body)) throw invalid('body', 'The request body must be a JSON object.');
  const contentType = parseString(req.body.contentType, 'contentType', 100);
  const bytes = parseBytes(req.body.bytes, BLOB_STORE_MAX_BYTES);
  if (!contentType.startsWith('image/')) throw invalid('contentType', 'An icon must be an image.');
  if (bytes > IMAGE_CAPS.categoryIcon) {
    throw imageTooLarge('icon', bytes, IMAGE_CAPS.categoryIcon);
  }
  const id = newUploadId(ctx);
  return {
    putUrl: previewPutUrl(id),
    key: `category-icons/${id}`,
    expiresAt: expiresAtIso(ctx),
  };
});

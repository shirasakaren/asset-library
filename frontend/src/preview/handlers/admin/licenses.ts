import type { AdminLicense } from '@/lib/api/admin-types';
import type { AssetRecord, LicenseRecord } from '../../records';
import { conflict, notFound } from '../../router/errors';
import type { PreviewContext } from '../../router/router';
import { recordAudit } from '../audit-core';
import { serialized } from '../write-queue';
import { adminRoute, cmpStr } from './common';
import {
  asBody,
  Problems,
  readBoolean,
  readCount,
  readI18n,
  readString,
  SLUG_MAX,
  SLUG_REGEX,
} from './input';

const NAME_MAX = 140;

const licenseNotFound = (id: string) =>
  notFound(`License ${id} not found.`, { code: 'license.not_found' });
const inUse = (message: string) => conflict(message, { code: 'license.in_use' });

/** Active first, then by sort order (the backend's `isActive desc, sortOrder asc`). */
const activeFirst = (a: LicenseRecord, b: LicenseRecord) =>
  Number(b.isActive) - Number(a.isActive) || a.sortOrder - b.sortOrder || cmpStr(a.id, b.id);

const toAdmin = (l: LicenseRecord, assetCount: number): AdminLicense => ({
  id: l.id,
  slug: l.slug,
  name: l.name,
  description: { en: l.description.en, id: l.description.id },
  fullText: { en: l.fullText.en, id: l.fullText.id },
  sortOrder: l.sortOrder,
  isActive: l.isActive,
  assetCount,
  createdAt: l.createdAt,
  updatedAt: l.updatedAt,
});

/** Non-deleted assets per license (what the admin list shows). */
const countByLicense = (assets: readonly AssetRecord[]): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const a of assets) {
    if (a.status !== 'DELETED') counts.set(a.licenseId, (counts.get(a.licenseId) ?? 0) + 1);
  }
  return counts;
};

async function viewOf(ctx: PreviewContext, id: string): Promise<AdminLicense> {
  const [row, assets] = await Promise.all([
    ctx.db.get<LicenseRecord>('licenses', id),
    ctx.db.list<AssetRecord>('assets'),
  ]);
  return toAdmin(row!, countByLicense(assets).get(id) ?? 0);
}

/** Every license template, active and inactive, with the number of non-deleted assets using it. */
adminRoute('GET', '/admin/licenses', async (_req, ctx): Promise<AdminLicense[]> => {
  const [rows, assets] = await Promise.all([
    ctx.db.list<LicenseRecord>('licenses'),
    ctx.db.list<AssetRecord>('assets'),
  ]);
  const counts = countByLicense(assets);
  return rows.sort(activeFirst).map((l) => toAdmin(l, counts.get(l.id) ?? 0));
});

/**
 * Creates a license: `{ slug, name, description: { en, id }, fullText: { en, id }, sortOrder?,
 * isActive? }` (the texts may be empty, the form sends the English text for a blank Indonesian
 * one). A slug that exists is a 409 `license.in_use` (the backend's code for it). `sortOrder`
 * defaults to the end. The record id is `lic-<slug>`, or a generated one when that is taken. Audit
 * `license.create { slug }`.
 */
adminRoute('POST', '/admin/licenses', (req, ctx) => {
  const body = asBody(req.body);
  const problems = new Problems();
  const slug = readString(body, 'slug', problems, { required: true, min: 1, max: SLUG_MAX });
  if (slug && !SLUG_REGEX.test(slug)) {
    problems.add('slug', 'invalid', 'slug must be lowercase kebab-case.');
  }
  const name = readString(body, 'name', problems, { required: true, min: 1, max: NAME_MAX });
  const description = readI18n(body, 'description', problems, { requireBoth: true });
  const fullText = readI18n(body, 'fullText', problems, { requireBoth: true });
  const sortOrder = readCount(body, 'sortOrder', problems);
  const isActive = readBoolean(body, 'isActive', problems);
  problems.check('Invalid license.');

  return serialized(async () => {
    const rows = await ctx.db.list<LicenseRecord>('licenses');
    if (rows.some((l) => l.slug === slug)) throw inUse(`Slug "${slug}" is already taken.`);
    const now = ctx.now().toISOString();
    const wanted = `lic-${slug}`;
    const row = await ctx.db.put<LicenseRecord>('licenses', {
      id: rows.some((l) => l.id === wanted) ? ctx.newId('lic') : wanted,
      slug: slug!,
      name: name!,
      description: { en: description!.en!, id: description!.id! },
      fullText: { en: fullText!.en!, id: fullText!.id! },
      sortOrder: sortOrder ?? rows.reduce((max, l) => Math.max(max, l.sortOrder), -1) + 1,
      isActive: isActive ?? true,
      createdAt: now,
      updatedAt: now,
    });
    await recordAudit(ctx, {
      action: 'license.create',
      subjectType: 'License',
      subjectId: row.id,
      metadata: { slug: row.slug },
    });
    ctx.emit({ type: 'assets.changed' });
    return viewOf(ctx, row.id);
  });
});

/**
 * Partial update: `name`, `description` and `fullText` (per language, the other keeps its text),
 * `sortOrder`, `isActive`. The slug is fixed once created (a `slug` in the body, which the edit
 * modal always sends, is ignored). Only values that differ are written; audit `license.update {
 * fields }` lists them, and a patch that changes nothing writes and audits nothing.
 */
adminRoute('PATCH', '/admin/licenses/{id}', (req, ctx) => {
  const body = asBody(req.body);
  const problems = new Problems();
  const name = readString(body, 'name', problems, { min: 1, max: NAME_MAX }) ?? undefined;
  const description = readI18n(body, 'description', problems);
  const fullText = readI18n(body, 'fullText', problems);
  const sortOrder = readCount(body, 'sortOrder', problems);
  const isActive = readBoolean(body, 'isActive', problems);
  problems.check('Invalid license.');

  return serialized(async () => {
    const id = req.params.id!;
    const row = await ctx.db.get<LicenseRecord>('licenses', id);
    if (!row) throw licenseNotFound(id);
    const patch: Partial<LicenseRecord> = {};
    const fields: string[] = [];
    if (name !== undefined && name !== row.name) {
      patch.name = name;
      fields.push('name');
    }
    for (const [key, value] of [
      ['description', description],
      ['fullText', fullText],
    ] as const) {
      if (!value) continue;
      const merged = { en: value.en ?? row[key].en, id: value.id ?? row[key].id };
      if (merged.en !== row[key].en || merged.id !== row[key].id) {
        patch[key] = merged;
        fields.push(key);
      }
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
      await ctx.db.patch<LicenseRecord>('licenses', id, {
        ...patch,
        updatedAt: ctx.now().toISOString(),
      });
      await recordAudit(ctx, {
        action: 'license.update',
        subjectType: 'License',
        subjectId: id,
        metadata: { fields },
      });
      ctx.emit({ type: 'assets.changed' });
    }
    return viewOf(ctx, id);
  });
});

/**
 * Deletes a license nothing references: 409 `license.in_use` while ANY asset (soft-deleted ones
 * included) still has it. Audit `license.delete { slug }`.
 */
adminRoute('DELETE', '/admin/licenses/{id}', (req, ctx) =>
  serialized(async () => {
    const id = req.params.id!;
    const [row, assets] = await Promise.all([
      ctx.db.get<LicenseRecord>('licenses', id),
      ctx.db.list<AssetRecord>('assets'),
    ]);
    if (!row) throw licenseNotFound(id);
    const usage = assets.filter((a) => a.licenseId === id).length;
    if (usage > 0) throw inUse(`License is referenced by ${usage} asset(s) - reassign first.`);
    await ctx.db.remove('licenses', id);
    await recordAudit(ctx, {
      action: 'license.delete',
      subjectType: 'License',
      subjectId: id,
      metadata: { slug: row.slug },
    });
    ctx.emit({ type: 'assets.changed' });
    return undefined;
  }),
);

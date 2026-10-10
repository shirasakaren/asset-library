import type { AdminFeaturedSlot } from '@/lib/api/admin-types';
import type { LocaleCode } from '@/lib/api/types';
import type { AssetRecord, FeaturedRecord } from '../../records';
import { badRequest, conflict, notFound } from '../../router/errors';
import type { PreviewContext } from '../../router/router';
import { BLOB_STORE_MAX_BYTES, getBlobStore } from '../../uploads/blob-store';
import { blobToDataUrl } from '../../uploads/blob-url';
import { recordAudit } from '../audit-core';
import { createNotification } from '../notifications';
import {
  expiresAtIso,
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
  type Body,
} from './input';

/** At most this many ACTIVE slots (`ACTIVE_CAP` in the backend). Inactive ones are not limited. */
export const FEATURED_ACTIVE_CAP = 5;
const TITLE_MAX = 140;
const BANNER_PREFIX = 'featured-banners/';
const DELETED_ASSET_TITLE = '(deleted asset)';

const slotNotFound = (id: string) =>
  notFound(`Featured slot ${id} not found.`, { code: 'featured.not_found' });

const byPosition = (a: FeaturedRecord, b: FeaturedRecord) =>
  a.sortOrder - b.sortOrder || cmpStr(a.id, b.id);

/**
 * `AdminFeaturedSlot`. `sortOrder` is the slot's 0-based POSITION (active slots first, then the
 * inactive ones), not the stored
 * number: the page prints `#{sortOrder + 1}` and the seed stores 1..5 (so it would start at #2),
 * and the real backend renumbers from 0 on every reorder. The stored number only has to sort.
 */
function toSlot(
  s: FeaturedRecord,
  position: number,
  assets: ReadonlyMap<string, Pick<AssetRecord, 'title' | 'slug'>>,
): AdminFeaturedSlot {
  const asset = assets.get(s.assetId);
  return {
    id: s.id,
    assetId: s.assetId,
    assetTitle: asset?.title ?? DELETED_ASSET_TITLE,
    assetSlug: asset?.slug ?? '',
    customBannerKey: s.customBannerKey,
    customBannerUrl: s.customBannerUrl,
    customTitle: s.customTitle,
    customShortDescription: s.customShortDescription,
    sortOrder: position,
    isActive: s.isActive,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

/** Active slots first, then by stored number (the backend's `isActive desc, sortOrder asc`). */
const activeFirst = (a: FeaturedRecord, b: FeaturedRecord) =>
  Number(b.isActive) - Number(a.isActive) || byPosition(a, b);

async function loadView(ctx: PreviewContext) {
  const [slots, assets] = await Promise.all([
    ctx.db.list<FeaturedRecord>('featured'),
    ctx.db.list<AssetRecord>('assets'),
  ]);
  return { slots: slots.sort(activeFirst), assets: new Map(assets.map((a) => [a.id, a])) };
}

/** The DTO of one slot at its current position. */
async function slotView(ctx: PreviewContext, id: string): Promise<AdminFeaturedSlot> {
  const { slots, assets } = await loadView(ctx);
  const index = slots.findIndex((s) => s.id === id);
  return toSlot(slots[index]!, index, assets);
}

adminRoute('GET', '/admin/featured', async (_req, ctx): Promise<AdminFeaturedSlot[]> => {
  const { slots, assets } = await loadView(ctx);
  return slots.map((s, i) => toSlot(s, i, assets));
});

/* -------------------------------------------------------------------------- *
 * Banner uploads
 * -------------------------------------------------------------------------- */

/**
 * Presigned-PUT stand-in. The modal PUTs the file to the returned `preview://` URL (the blob
 * store) and later sends `key` when it saves the slot; the bytes become a `data:` URL then. Like the
 * thumbnails the demo keeps images up to 5 MB.
 */
adminRoute('POST', '/admin/featured/banner-uploads/initiate', (req, ctx) => {
  if (!isObject(req.body)) throw invalid('body', 'The request body must be a JSON object.');
  const contentType = parseString(req.body.contentType, 'contentType', 100);
  parseBytes(req.body.bytes, BLOB_STORE_MAX_BYTES);
  if (!contentType.startsWith('image/')) {
    throw invalid('contentType', 'A banner must be an image.');
  }
  const id = newUploadId(ctx);
  return { putUrl: previewPutUrl(id), key: `${BANNER_PREFIX}${id}`, expiresAt: expiresAtIso(ctx) };
});

interface Banner {
  key: string;
  url: string | null;
  /** The upload to delete once the slot is saved. */
  blobId?: string;
}

/**
 * Turns the `customBannerKey` of a request into the key and image URL to store. The key of the
 * slot's own banner is kept as it is; an upload key (`featured-banners/<id>`) is read from the blob
 * store into a `data:` URL (400 when the upload never arrived, was not kept or is no image); any
 * other key is stored without an image (the asset thumbnail shows, like a seeded key).
 */
async function resolveBanner(
  key: string,
  current: Pick<FeaturedRecord, 'customBannerKey' | 'customBannerUrl'> | undefined,
): Promise<Banner> {
  if (current?.customBannerKey === key) return { key, url: current.customBannerUrl };
  if (!key.startsWith(BANNER_PREFIX)) return { key, url: null };
  const blobId = key.slice(BANNER_PREFIX.length);
  const missing = (message: string) =>
    badRequest(message, { fields: [{ path: 'customBannerKey', code: 'invalid', message }] });
  if (!blobId || blobId.includes('/')) throw missing('customBannerKey is not a valid upload key.');
  const entry = await getBlobStore().get(blobId);
  if (!entry) throw missing('The banner upload was not found. Upload the image again.');
  if (!entry.blob) throw missing('The banner was not kept (over 5 MB).');
  if (!entry.type.startsWith('image/')) throw missing('The upload is not an image.');
  return { key, url: await blobToDataUrl(entry.blob), blobId };
}

const dropUpload = async (banner: Banner | undefined) => {
  if (banner?.blobId) await getBlobStore().delete(banner.blobId);
};

/* -------------------------------------------------------------------------- *
 * Input
 * -------------------------------------------------------------------------- */

type Copy = Record<LocaleCode, string> | null;

/** `{ en?, id? }` to the stored pair; an empty pair is no override at all. */
function toCopy(raw: Partial<Record<LocaleCode, string>>): Copy {
  const copy = { en: raw.en ?? '', id: raw.id ?? '' };
  return copy.en.trim() || copy.id.trim() ? copy : null;
}

interface Fields {
  customBannerKey?: string | null;
  customTitle?: string | null;
  customShortDescription?: Copy;
  isActive?: boolean;
  sortOrder?: number;
}

function parseFields(body: Body, problems: Problems): Fields {
  const out: Fields = {};
  const key = readString(body, 'customBannerKey', problems, { nullable: true, min: 1, max: 512 });
  if (key !== undefined) out.customBannerKey = key;
  const title = readString(body, 'customTitle', problems, { nullable: true, max: TITLE_MAX });
  if (title !== undefined) out.customTitle = title || null;
  if (body.customShortDescription === null) {
    out.customShortDescription = null;
  } else {
    const copy = readI18n(body, 'customShortDescription', problems);
    if (copy) out.customShortDescription = toCopy(copy);
  }
  const active = readBoolean(body, 'isActive', problems);
  if (active !== undefined) out.isActive = active;
  const sort = readCount(body, 'sortOrder', problems);
  if (sort !== undefined) out.sortOrder = sort;
  return out;
}

const capReached = () =>
  conflict(
    `Already ${FEATURED_ACTIVE_CAP} active featured slots - deactivate one before adding another.`,
    { code: 'featured.active_cap_reached' },
  );

/* -------------------------------------------------------------------------- *
 * Notification
 * -------------------------------------------------------------------------- */

/**
 * `FEATURED_FEATURED` for the owner of a newly featured asset, unless the owner is the one who
 * featured it (the backend's `asset.ownerId !== admin.id`). Only the persona has an inbox, and every
 * demo request is made BY the persona, so the routes never produce one; this is for simulations and
 * tests. Returns the notification id, if one was created.
 */
export async function notifyOwnerFeatured(
  ctx: PreviewContext,
  args: {
    asset: Pick<AssetRecord, 'id' | 'slug' | 'title' | 'ownerId'>;
    slot: Pick<FeaturedRecord, 'id'>;
    actorId: string;
  },
): Promise<string | undefined> {
  const { asset, slot, actorId } = args;
  if (asset.ownerId === actorId || asset.ownerId !== ctx.meId) return undefined;
  const n = await createNotification(ctx, 'FEATURED_FEATURED', {
    assetId: asset.id,
    assetSlug: asset.slug,
    assetTitle: asset.title,
    featuredId: slot.id,
    featuredAt: ctx.now().toISOString(),
  });
  return n.id;
}

/* -------------------------------------------------------------------------- *
 * Create / update / delete / reorder
 * -------------------------------------------------------------------------- */

/**
 * Creates a slot at the end. Checks, in the backend's order: the asset exists (404
 * `asset.not_found`; a soft-deleted one does not), then (preview) it is PUBLISHED and not featured
 * yet (400 `featured.asset_not_published` / `featured.already_featured`; 400 so the page's
 * "maximum 5" toast, which it shows for every 409, is not misleading), then the active cap (409
 * `featured.active_cap_reached`, the status the page branches on). Audit `featured.create { assetId }`.
 */
adminRoute('POST', '/admin/featured', (req, ctx, admin) => {
  const body = asBody(req.body);
  const problems = new Problems();
  const assetId = readString(body, 'assetId', problems, { required: true, min: 1 });
  const fields = parseFields(body, problems);
  problems.check('Invalid featured slot.');

  return serialized(async () => {
    const asset = await ctx.db.get<AssetRecord>('assets', assetId!);
    if (!asset || asset.status === 'DELETED') {
      throw notFound(`Asset ${assetId} not found.`, { code: 'asset.not_found' });
    }
    if (asset.status !== 'PUBLISHED') {
      throw badRequest('Only a published asset can be featured.', {
        code: 'featured.asset_not_published',
      });
    }
    const slots = await ctx.db.list<FeaturedRecord>('featured');
    if (slots.some((s) => s.assetId === asset.id)) {
      throw badRequest('This asset is already featured.', { code: 'featured.already_featured' });
    }
    const isActive = fields.isActive ?? true;
    if (isActive && slots.filter((s) => s.isActive).length >= FEATURED_ACTIVE_CAP) {
      throw capReached();
    }
    const banner = fields.customBannerKey
      ? await resolveBanner(fields.customBannerKey, undefined)
      : undefined;
    const now = ctx.now().toISOString();
    const row = await ctx.db.put<FeaturedRecord>('featured', {
      id: ctx.newId('fs'),
      assetId: asset.id,
      customBannerKey: banner?.key ?? null,
      customBannerUrl: banner?.url ?? null,
      customTitle: fields.customTitle ?? null,
      customShortDescription: fields.customShortDescription ?? null,
      sortOrder: slots.reduce((max, s) => Math.max(max, s.sortOrder), -1) + 1,
      isActive,
      createdAt: now,
      updatedAt: now,
    });
    await dropUpload(banner);
    await recordAudit(ctx, {
      action: 'featured.create',
      subjectType: 'FeaturedSlot',
      subjectId: row.id,
      metadata: { assetId: asset.id },
    });
    if (isActive) await notifyOwnerFeatured(ctx, { asset, slot: row, actorId: admin.id });
    ctx.emit({ type: 'assets.changed' });
    return slotView(ctx, row.id);
  });
});

/**
 * Partial update: the copy fields, `isActive` (re-activating needs room under the cap) and
 * `sortOrder`. `null` clears an override (the backend can only keep or replace it); a banner key
 * equal to the slot's own keeps the stored image. Audit `featured.update { fields }` (the fields
 * that were sent); a body with none of them changes and audits nothing.
 */
adminRoute('PATCH', '/admin/featured/{id}', (req, ctx) => {
  const problems = new Problems();
  const fields = parseFields(asBody(req.body), problems);
  problems.check('Invalid featured slot.');
  return serialized(async () => {
    const id = req.params.id!;
    const row = await ctx.db.get<FeaturedRecord>('featured', id);
    if (!row) throw slotNotFound(id);
    const sent = (Object.keys(fields) as Array<keyof Fields>).filter(
      (k) => fields[k] !== undefined,
    );
    const order: Array<keyof Fields> = [
      'customBannerKey',
      'customTitle',
      'customShortDescription',
      'isActive',
      'sortOrder',
    ];
    const changed = order.filter((k) => sent.includes(k));
    if (changed.length === 0) return slotView(ctx, id);

    if (fields.isActive === true && !row.isActive) {
      const active = (await ctx.db.list<FeaturedRecord>('featured')).filter((s) => s.isActive);
      if (active.length >= FEATURED_ACTIVE_CAP) throw capReached();
    }
    const patch: Partial<FeaturedRecord> = { updatedAt: ctx.now().toISOString() };
    let banner: Banner | undefined;
    if (fields.customBannerKey === null) {
      patch.customBannerKey = null;
      patch.customBannerUrl = null;
    } else if (fields.customBannerKey) {
      banner = await resolveBanner(fields.customBannerKey, row);
      patch.customBannerKey = banner.key;
      patch.customBannerUrl = banner.url;
    }
    if (fields.customTitle !== undefined) patch.customTitle = fields.customTitle;
    if (fields.customShortDescription !== undefined) {
      patch.customShortDescription = fields.customShortDescription;
    }
    if (fields.isActive !== undefined) patch.isActive = fields.isActive;
    if (fields.sortOrder !== undefined) patch.sortOrder = fields.sortOrder;
    await ctx.db.patch<FeaturedRecord>('featured', id, patch);
    await dropUpload(banner);
    await recordAudit(ctx, {
      action: 'featured.update',
      subjectType: 'FeaturedSlot',
      subjectId: id,
      metadata: { fields: changed },
    });
    ctx.emit({ type: 'assets.changed' });
    return slotView(ctx, id);
  });
});

/** Hard delete of the slot; the asset is untouched. Audit `featured.delete`. */
adminRoute('DELETE', '/admin/featured/{id}', (req, ctx) =>
  serialized(async () => {
    const id = req.params.id!;
    if (!(await ctx.db.get('featured', id))) throw slotNotFound(id);
    await ctx.db.remove('featured', id);
    await recordAudit(ctx, {
      action: 'featured.delete',
      subjectType: 'FeaturedSlot',
      subjectId: id,
    });
    ctx.emit({ type: 'assets.changed' });
    return undefined;
  }),
);

/**
 * `{ orderedIds }`: distinct existing slot ids (404 `featured.not_found` for an unknown one, all
 * or nothing). The listed slots take positions 0..n-1 in that order and any slot not listed
 * (the page sends the active ones only) follows in its current order, so the stored numbers stay
 * distinct. Audit `featured.reorder { order }` on the first id of the list.
 */
adminRoute('POST', '/admin/featured/reorder', (req, ctx) => {
  const orderedIds = readOrderedIds(req.body);
  return serialized(async () => {
    const slots = (await ctx.db.list<FeaturedRecord>('featured')).sort(byPosition);
    const known = new Set(slots.map((s) => s.id));
    for (const id of orderedIds) if (!known.has(id)) throw slotNotFound(id);
    const listed = new Set(orderedIds);
    const finalOrder = [...orderedIds, ...slots.filter((s) => !listed.has(s.id)).map((s) => s.id)];
    const now = ctx.now().toISOString();
    for (const [index, id] of finalOrder.entries()) {
      const row = slots.find((s) => s.id === id)!;
      if (row.sortOrder !== index) {
        await ctx.db.patch<FeaturedRecord>('featured', id, { sortOrder: index, updatedAt: now });
      }
    }
    await recordAudit(ctx, {
      action: 'featured.reorder',
      subjectType: 'FeaturedSlot',
      subjectId: orderedIds[0]!,
      metadata: { order: orderedIds },
    });
    ctx.emit({ type: 'assets.changed' });
    return undefined;
  });
});

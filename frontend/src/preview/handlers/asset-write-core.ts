import type { LocaleCode, PreviewMediaItem, TipTapDoc } from '@/lib/api/types';
import type { AssetRecord, TagRecord } from '../records';
import type { PreviewContext } from '../router/router';
import { forbidden, notFound } from '../router/errors';
import { findAsset, getMe, visibleTo, type Viewer } from './helpers';

/** `ctx.now()` as ISO-8601 truncated to whole seconds (what every stored timestamp looks like). */
export function isoSeconds(ctx: PreviewContext): string {
  return new Date(Math.floor(ctx.now().getTime() / 1000) * 1000).toISOString();
}

export interface Writable {
  asset: AssetRecord;
  assets: AssetRecord[];
  viewer: Viewer;
}

/**
 * Loads the asset a write targets (id or slug). Unknown, DELETED and not-visible assets (somebody
 * else's DRAFT / ARCHIVED one) are a 404; a visible asset the caller neither owns nor may admin
 * is a 403. Call it INSIDE `serialized(...)`, so the record is read fresh.
 */
export async function loadWritable(ctx: PreviewContext, idOrSlug: string): Promise<Writable> {
  const [viewer, assets] = await Promise.all([getMe(ctx), ctx.db.list<AssetRecord>('assets')]);
  const asset = findAsset(assets, idOrSlug);
  if (!asset || !visibleTo(asset, viewer.id, viewer.isAdmin)) {
    throw notFound(`Asset ${idOrSlug} not found.`, { code: 'asset.not_found' });
  }
  if (!viewer.isAdmin && asset.ownerId !== viewer.id) {
    throw forbidden('You do not own this asset.', { code: 'auth.forbidden' });
  }
  return { asset, assets, viewer };
}

/* -------------------------------------------------------------------------- *
 * Slugs
 * -------------------------------------------------------------------------- */

/**
 * Backend `slugify` (lowercase, NFKD, drop punctuation, spaces to hyphens, 80 chars) with two
 * changes: runs of hyphens collapse and edge hyphens are trimmed, and a title with nothing
 * usable (CJK, emoji, punctuation) becomes "asset" instead of random hex, so `-2`, `-3` applies.
 */
export function slugifyTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+/, '')
    .slice(0, 80)
    .replace(/-+$/, '');
  return slug || 'asset';
}

/** `base`, else `base-2`, `base-3`, ... (the first one not in `taken`). */
export function uniqueSlug(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * Every slug and id in use. DELETED assets keep theirs (the real column is unique); ids count
 * because `GET /assets/{idOrSlug}` prefers an id match, which would shadow a slug equal to it.
 */
export function takenSlugs(assets: AssetRecord[], except?: string): Set<string> {
  const taken = new Set<string>();
  for (const a of assets) {
    if (a.id === except) continue;
    taken.add(a.slug);
    taken.add(a.id);
  }
  return taken;
}

/* -------------------------------------------------------------------------- *
 * Tags
 * -------------------------------------------------------------------------- */

/** Backend `TagsService.toSlug` (50 chars). */
export function tagSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 50);
}

export interface TagPlan {
  /** Resolved ids in input order, without duplicates. */
  tagIds: string[];
  /** Tags that do not exist yet (usageCount 0; `commitTags` counts them). */
  created: TagRecord[];
}

/**
 * Resolves the tag names / slugs the wizard sends: an existing tag with the same slug is reused
 * (its display name is NOT overwritten, unlike the backend upsert, which would rename "Low Poly"
 * to "low-poly"); otherwise a new `tag-<slug>` is planned. Blank or slugless inputs are dropped.
 */
export function planTags(
  ctx: PreviewContext,
  inputs: string[],
  existing: TagRecord[],
  nowIso: string,
): TagPlan {
  const bySlug = new Map(existing.map((t) => [t.slug, t]));
  const ids = new Set(existing.map((t) => t.id));
  const tagIds: string[] = [];
  const created: TagRecord[] = [];
  for (const raw of inputs) {
    const name = raw.trim();
    const slug = tagSlug(name);
    if (!name || !slug) continue;
    let tag = bySlug.get(slug);
    if (!tag) {
      const id = ids.has(`tag-${slug}`) ? ctx.newId('tag') : `tag-${slug}`;
      tag = { id, slug, displayName: name, usageCount: 0, createdAt: nowIso };
      bySlug.set(slug, tag);
      ids.add(id);
      created.push(tag);
    }
    if (!tagIds.includes(tag.id)) tagIds.push(tag.id);
  }
  return { tagIds, created };
}

/**
 * Persists a plan and the `usageCount` change from `before` to `plan.tagIds`: +1 for added tags,
 * -1 (never below 0) for removed ones.
 */
export async function commitTags(
  ctx: PreviewContext,
  plan: TagPlan,
  before: readonly string[],
): Promise<void> {
  const after = new Set(plan.tagIds);
  const was = new Set(before);
  for (const t of plan.created) await ctx.db.put<TagRecord>('tags', { ...t, usageCount: 0 });
  await adjustTagUsage(
    ctx,
    plan.tagIds.filter((id) => !was.has(id)),
    1,
  );
  await adjustTagUsage(
    ctx,
    before.filter((id) => !after.has(id)),
    -1,
  );
}

export async function adjustTagUsage(
  ctx: PreviewContext,
  tagIds: readonly string[],
  delta: 1 | -1,
): Promise<void> {
  for (const id of tagIds) {
    const tag = await ctx.db.get<TagRecord>('tags', id);
    if (tag) {
      await ctx.db.patch<TagRecord>('tags', id, {
        usageCount: Math.max(0, tag.usageCount + delta),
      });
    }
  }
}

/* -------------------------------------------------------------------------- *
 * Translations
 * -------------------------------------------------------------------------- */

export interface Translation {
  locale: LocaleCode;
  shortDescription: string;
  longDescription: TipTapDoc;
}

const MEDIA_NODES = new Set(['image', 'video', 'embed', 'horizontalRule', 'table']);

/** Whether a TipTap document has any visible text or media. */
export function docHasContent(doc: unknown): boolean {
  const walk = (n: unknown): boolean => {
    if (typeof n !== 'object' || n === null) return false;
    const node = n as { type?: unknown; text?: unknown; content?: unknown };
    if (typeof node.text === 'string' && node.text.trim() !== '') return true;
    if (typeof node.type === 'string' && MEDIA_NODES.has(node.type)) return true;
    return Array.isArray(node.content) && node.content.some(walk);
  };
  return walk(doc);
}

type TranslationFields = Pick<
  AssetRecord,
  'shortDescription' | 'longDescription' | 'shortDescriptionI18n' | 'availableLocales'
>;

/**
 * Applies translations to the stored description fields. English is the base language
 * (`shortDescription`, `longDescription`, `shortDescriptionI18n.en`) and is always overwritten,
 * so it can be cleared. Other locales only keep their short text (the stored long description
 * is English only) and an EMPTY translation does not wipe existing text: the wizard sends
 * `id` with empty fields on every save because it never loads the Indonesian text.
 * `availableLocales` = `en` once sent, plus every locale that has content.
 */
export function applyTranslations(
  base: TranslationFields,
  translations: Translation[],
): TranslationFields {
  let { shortDescription, longDescription } = base;
  const i18n = { ...base.shortDescriptionI18n };
  const locales = new Set<LocaleCode>(base.availableLocales);
  for (const t of translations) {
    if (t.locale === 'en') {
      shortDescription = t.shortDescription;
      longDescription = t.longDescription;
      i18n.en = t.shortDescription;
      locales.add('en');
    } else if (t.shortDescription.trim() !== '' || docHasContent(t.longDescription)) {
      i18n[t.locale] = t.shortDescription;
      locales.add(t.locale);
    }
  }
  return {
    shortDescription,
    longDescription,
    shortDescriptionI18n: i18n,
    availableLocales: (['en', 'id'] as const).filter((l) => locales.has(l)),
  };
}

/* -------------------------------------------------------------------------- *
 * Preview media
 * -------------------------------------------------------------------------- */

export interface PreviewMediaInput extends Omit<PreviewMediaItem, 'viewUrl'> {
  viewUrl?: string;
}

/**
 * The backend re-signs `viewUrl` from `key` and ignores the client's; there is no signing here,
 * so the URL the client sent (a Blob URL from an upload) is kept, then the one already stored
 * for the same item, then `/<key>` for bundled `thumbs/` art, then the key itself.
 */
export function resolvePreviewMedia(
  items: PreviewMediaInput[],
  existing: PreviewMediaItem[],
): PreviewMediaItem[] {
  const known = new Map(existing.flatMap((m) => [[m.id, m] as const, [m.key, m] as const]));
  return items.map((m) => {
    const prior = known.get(m.id) ?? known.get(m.key);
    const viewUrl =
      m.viewUrl ?? prior?.viewUrl ?? (m.key.startsWith('thumbs/') ? `/${m.key}` : m.key);
    const out: PreviewMediaItem = {
      id: m.id,
      kind: m.kind,
      key: m.key,
      label: m.label,
      viewUrl,
      visibility: m.visibility ?? 'visible',
    };
    const originalUrl = m.originalUrl ?? prior?.originalUrl;
    if (m.displayKey) out.displayKey = m.displayKey;
    if (originalUrl) out.originalUrl = originalUrl;
    if (m.mime) out.mime = m.mime;
    if (m.warning) out.warning = m.warning;
    return out;
  });
}

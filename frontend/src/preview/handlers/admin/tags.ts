import type { AdminTagPage, AdminTagRow } from '@/lib/api/admin-types';
import type { AssetRecord, TagRecord } from '../../records';
import { badRequest, conflict, notFound } from '../../router/errors';
import { paginate } from '../../router/paginate';
import { recordAudit } from '../audit-core';
import { normalize } from '../text-search';
import { serialized } from '../write-queue';
import { adminRoute, cmpStr } from './common';
import { asBody, Problems, readString, SLUG_MAX, SLUG_REGEX } from './input';

const NAME_MAX = 80;
const SORTS = ['name', 'usage', 'newest'] as const;
type TagSort = (typeof SORTS)[number];

const tagNotFound = (id: string) => notFound(`Tag ${id} not found.`, { code: 'tag.not_found' });

const toRow = (t: TagRecord): AdminTagRow => ({
  id: t.id,
  slug: t.slug,
  displayName: t.displayName,
  usageCount: t.usageCount,
  createdAt: t.createdAt,
});

/** Display name A-Z ignoring case, `id` descending as the tiebreak (the backend's order). */
const byName = (a: TagRecord, b: TagRecord) =>
  cmpStr(a.displayName.toLowerCase(), b.displayName.toLowerCase()) || cmpStr(b.id, a.id);

const COMPARATORS: Record<TagSort, (a: TagRecord, b: TagRecord) => number> = {
  name: byName,
  usage: (a, b) => b.usageCount - a.usageCount || byName(a, b),
  newest: (a, b) => cmpStr(b.createdAt, a.createdAt) || cmpStr(b.id, a.id),
};

function usageParam(query: URLSearchParams, key: 'minUsage' | 'maxUsage'): number | undefined {
  const raw = query.get(key);
  if (raw === null || raw === '') return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) throw badRequest(`${key} must be an integer of at least 0.`);
  return n;
}

/**
 * Tags with their usage: `q` (display name or slug contains it, any case), `minUsage` /
 * `maxUsage`, `sort` (`name` by default as the backend, `usage` most used first, `newest`), cursor
 * pages (the page sends `q` and `limit: 50`).
 */
adminRoute('GET', '/admin/tags', async (req, ctx): Promise<AdminTagPage> => {
  const sortParam = req.query.get('sort') || 'name';
  if (!(SORTS as readonly string[]).includes(sortParam)) {
    throw badRequest(`Unknown sort "${sortParam}". Expected one of ${SORTS.join(', ')}.`);
  }
  const min = usageParam(req.query, 'minUsage');
  const max = usageParam(req.query, 'maxUsage');
  const needle = normalize((req.query.get('q') ?? '').trim());
  const rows = (await ctx.db.list<TagRecord>('tags'))
    .filter(
      (t) =>
        (!needle ||
          normalize(t.slug).includes(needle) ||
          normalize(t.displayName).includes(needle)) &&
        (min === undefined || t.usageCount >= min) &&
        (max === undefined || t.usageCount <= max),
    )
    .sort(COMPARATORS[sortParam as TagSort]);
  const page = paginate(rows, req.query);
  return { items: page.items.map(toRow), pageInfo: page.pageInfo };
});

/**
 * Merges tags into one: `{ fromTagIds, intoTagId }`. Every asset that carries a source tag
 * (soft-deleted ones too, so a restore stays consistent) gets the target instead, in the same
 * position and without duplicates; the target's `usageCount` grows by the live assets that did not
 * have it yet (so it stays equal to the live assets using it, which is what summing the counters
 * would get wrong for assets carrying several of the tags); the source tags are removed. 400
 * `tag.merge_into_self`, 404 `tag.not_found` (an unknown source or target, nothing written then).
 * Audit `tag.merge { merged: <source slugs>, into: <target slug> }` on the target.
 */
adminRoute('POST', '/admin/tags/merge', (req, ctx) => {
  const body = asBody(req.body);
  const problems = new Problems();
  const rawFrom = body.fromTagIds;
  if (
    !Array.isArray(rawFrom) ||
    rawFrom.length === 0 ||
    rawFrom.some((id) => typeof id !== 'string' || !id)
  ) {
    problems.add('fromTagIds', 'invalid', 'fromTagIds must be a non-empty array of tag ids.');
  }
  const into = readString(body, 'intoTagId', problems, { required: true, min: 1 });
  problems.check('Invalid merge.');
  const from = [...new Set(rawFrom as string[])];

  return serialized(async () => {
    if (from.includes(into!)) {
      throw badRequest('Cannot merge a tag into itself.', { code: 'tag.merge_into_self' });
    }
    const tags = new Map((await ctx.db.list<TagRecord>('tags')).map((t) => [t.id, t]));
    const target = tags.get(into!);
    if (!target) throw tagNotFound(into!);
    const sources = from.map((id) => tags.get(id));
    const missing = from.find((_, i) => !sources[i]);
    if (missing) throw tagNotFound(missing);

    const sourceIds = new Set(from);
    let gained = 0;
    for (const asset of await ctx.db.list<AssetRecord>('assets')) {
      if (!asset.tagIds.some((id) => sourceIds.has(id))) continue;
      const next: string[] = [];
      for (const id of asset.tagIds) {
        const mapped = sourceIds.has(id) ? target.id : id;
        if (!next.includes(mapped)) next.push(mapped);
      }
      if (asset.status !== 'DELETED' && !asset.tagIds.includes(target.id)) gained += 1;
      await ctx.db.patch<AssetRecord>('assets', asset.id, { tagIds: next });
    }
    await ctx.db.patch<TagRecord>('tags', target.id, { usageCount: target.usageCount + gained });
    for (const id of from) await ctx.db.remove('tags', id);
    await recordAudit(ctx, {
      action: 'tag.merge',
      subjectType: 'Tag',
      subjectId: target.id,
      metadata: { merged: sources.map((t) => t!.slug), into: target.slug },
    });
    ctx.emit({ type: 'assets.changed' });
    return undefined;
  });
});

/**
 * Renames a tag: `displayName` (1..80) and/or `slug` (kebab-case, <= 80, unique: 409 `tag.in_use`,
 * the backend's code for it; the rename modal always sends the slug, an unchanged one is not
 * checked). Only values that differ are written. Audit `tag.update { before, after }` for the
 * display name (the seeded shape) and `{ slugBefore, slugAfter }` for the slug; a rename that changes
 * nothing writes and audits nothing. Assets reference tags by id, so every asset shows the new name.
 */
adminRoute('PATCH', '/admin/tags/{id}', (req, ctx) => {
  const body = asBody(req.body);
  const problems = new Problems();
  const displayName =
    readString(body, 'displayName', problems, { min: 1, max: NAME_MAX }) ?? undefined;
  const slug = readString(body, 'slug', problems, { min: 1, max: SLUG_MAX }) ?? undefined;
  problems.check('Invalid tag.');

  return serialized(async () => {
    const id = req.params.id!;
    const row = await ctx.db.get<TagRecord>('tags', id);
    if (!row) throw tagNotFound(id);
    const patch: Partial<TagRecord> = {};
    const metadata: Record<string, string> = {};
    if (displayName !== undefined && displayName !== row.displayName) {
      patch.displayName = displayName;
      metadata.before = row.displayName;
      metadata.after = displayName;
    }
    if (slug !== undefined && slug !== row.slug) {
      if (!SLUG_REGEX.test(slug)) {
        throw badRequest('slug must be lowercase kebab-case.', {
          fields: [
            { path: 'slug', code: 'invalid', message: 'slug must be lowercase kebab-case.' },
          ],
        });
      }
      const tags = await ctx.db.list<TagRecord>('tags');
      if (tags.some((t) => t.slug === slug)) {
        throw conflict(`Slug "${slug}" is already in use.`, { code: 'tag.in_use' });
      }
      patch.slug = slug;
      metadata.slugBefore = row.slug;
      metadata.slugAfter = slug;
    }
    if (Object.keys(patch).length === 0) return toRow(row);
    const updated = await ctx.db.patch<TagRecord>('tags', id, patch);
    await recordAudit(ctx, {
      action: 'tag.update',
      subjectType: 'Tag',
      subjectId: id,
      metadata,
    });
    ctx.emit({ type: 'assets.changed' });
    return toRow(updated);
  });
});

/**
 * Deletes a tag no asset carries: 409 `tag.in_use` while ANY asset (soft-deleted ones included)
 * still references it (the page disables the button for a non-zero count; merge instead). Audit
 * `tag.delete { slug }`.
 */
adminRoute('DELETE', '/admin/tags/{id}', (req, ctx) =>
  serialized(async () => {
    const id = req.params.id!;
    const [row, assets] = await Promise.all([
      ctx.db.get<TagRecord>('tags', id),
      ctx.db.list<AssetRecord>('assets'),
    ]);
    if (!row) throw tagNotFound(id);
    const usage = assets.filter((a) => a.tagIds.includes(id)).length;
    if (usage > 0) {
      throw conflict(`Tag is used by ${usage} asset(s) - merge or untag first.`, {
        code: 'tag.in_use',
      });
    }
    await ctx.db.remove('tags', id);
    await recordAudit(ctx, {
      action: 'tag.delete',
      subjectType: 'Tag',
      subjectId: id,
      metadata: { slug: row.slug },
    });
    ctx.emit({ type: 'assets.changed' });
    return undefined;
  }),
);

import type { CollectionName, Doc } from '../../types';
import type { PreviewContext } from '../../router/router';

/**
 * Re-numbers the `sortOrder` of an ordered collection (featured slots, categories) from a
 * `reorder` request: the listed ids take 0..n-1 in the order given and every row that is not
 * listed (the featured page sends the active slots only) follows in its current order, so the
 * stored numbers end up distinct. `current` is the collection in its current order; `unknown`
 * builds the 404 for an id that is not in it (all or nothing: nothing is written then). Only rows
 * whose number changes are written. Call inside `serialized`.
 */
export async function renumber<T extends Doc & { sortOrder: number; updatedAt: string }>(
  ctx: PreviewContext,
  coll: CollectionName,
  current: readonly T[],
  orderedIds: readonly string[],
  unknown: (id: string) => Error,
): Promise<void> {
  const known = new Set(current.map((r) => r.id));
  for (const id of orderedIds) if (!known.has(id)) throw unknown(id);
  const listed = new Set(orderedIds);
  const finalOrder = [...orderedIds, ...current.filter((r) => !listed.has(r.id)).map((r) => r.id)];
  const byId = new Map(current.map((r) => [r.id, r]));
  const now = ctx.now().toISOString();
  for (const [index, id] of finalOrder.entries()) {
    if (byId.get(id)!.sortOrder !== index) {
      await ctx.db.patch<T>(coll, id, {
        sortOrder: index,
        updatedAt: now,
      } as unknown as Partial<T>);
    }
  }
}

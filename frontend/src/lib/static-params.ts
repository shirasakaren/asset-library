/**
 * `generateStaticParams` helper for `[id]` routes of the static export: one entry
 * per seeded document. An empty list would fail the export build ("missing
 * generateStaticParams"), so fall back to an inert placeholder until seed exists.
 */
export function seededIdParams(docs: ReadonlyArray<{ id: string }>): Array<{ id: string }> {
  const params = docs.map((d) => ({ id: d.id }));
  return params.length > 0 ? params : [{ id: '_placeholder' }];
}

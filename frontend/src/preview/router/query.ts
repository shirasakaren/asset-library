/** Serialize a query object like the real fetcher did: arrays repeat the param; undefined/null/'' are skipped. */
export function toSearchParams(query?: Record<string, unknown>): URLSearchParams {
  const sp = new URLSearchParams();
  if (!query) return sp;
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v)) {
      for (const item of v) {
        if (item === undefined || item === null || item === '') continue;
        sp.append(k, String(item));
      }
      continue;
    }
    sp.set(k, String(v));
  }
  return sp;
}

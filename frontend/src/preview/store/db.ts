import type { CollectionName, Db, Doc, OverlayEntry, OverlayStore, SeedSource } from '../types';

const clone = <T>(v: T): T => structuredClone(v);

const isEntry = (k: string, e: unknown): e is OverlayEntry => {
  if (!e || typeof e !== 'object') return false;
  const { op, doc } = e as OverlayEntry;
  if (op === 'del') return true;
  if (op !== 'put' || !doc || typeof doc.id !== 'string') return false;
  // key is `${coll}/${id}`; the stored doc must agree with it.
  return k.slice(k.indexOf('/') + 1) === doc.id;
};

export async function createDb(opts: {
  seed: SeedSource;
  overlay: OverlayStore | null;
  seedVersion: string;
}): Promise<Db> {
  const { seed, seedVersion } = opts;
  let overlay = opts.overlay;
  let entries = new Map<string, OverlayEntry>();
  let nextSeq = 1;

  if (overlay) {
    try {
      await overlay.open();
      const raw = await overlay.all();
      if ((await overlay.getMeta('seedVersion')) !== seedVersion) {
        await overlay.clear();
        await overlay.setMeta('seedVersion', seedVersion);
      } else {
        const valid = [...raw].filter(([k, e]) => isEntry(k, e));
        valid.sort(([, a], [, b]) => (a.seq ?? 0) - (b.seq ?? 0));
        for (const [k, e] of valid) {
          entries.set(k, e);
          if (typeof e.seq === 'number' && e.seq >= nextSeq) nextSeq = e.seq + 1;
        }
      }
    } catch {
      overlay = null;
      entries = new Map();
    }
  }

  let persistent = overlay !== null;
  const seedCache = new Map<CollectionName, Doc[]>();

  // A failed seed load is not cached, so the next call retries.
  const loadSeed = async (coll: CollectionName): Promise<Doc[]> => {
    const cached = seedCache.get(coll);
    if (cached) return cached;
    try {
      const docs = (await seed.load(coll)).map(clone);
      seedCache.set(coll, docs);
      return docs;
    } catch (e) {
      console.warn(`[preview] failed to load seed "${coll}"`, e);
      return [];
    }
  };

  /** Synchronously updates memory, then writes through to the overlay (never throws). */
  const persist = async (k: string, entry: OverlayEntry): Promise<void> => {
    entries.set(k, entry);
    if (!overlay) return;
    try {
      await overlay.set(k, entry);
    } catch {
      persistent = false;
      overlay = null;
    }
  };

  const key = (coll: CollectionName, id: string) => `${coll}/${id}`;

  /** Synchronous lookup; the seed collection must already be loaded. */
  const lookup = (coll: CollectionName, id: string, base: Doc[]): Doc | undefined => {
    const e = entries.get(key(coll, id));
    if (e) return e.op === 'put' ? e.doc : undefined;
    return base.find((d) => d.id === id);
  };

  const putEntry = (coll: CollectionName, doc: Doc): Promise<void> => {
    const k = key(coll, doc.id);
    const prev = entries.get(k);
    const seq = prev?.op === 'put' && prev.seq !== undefined ? prev.seq : nextSeq++;
    return persist(k, { op: 'put', doc, seq });
  };

  return {
    async list<T extends Doc>(coll: CollectionName): Promise<T[]> {
      const base = await loadSeed(coll);
      const prefix = `${coll}/`;
      const seen = new Set<string>();
      const out: Doc[] = [];
      for (const doc of base) {
        seen.add(doc.id);
        const e = entries.get(prefix + doc.id);
        if (!e) out.push(doc);
        else if (e.op === 'put' && e.doc) out.push(e.doc);
      }
      const extra: OverlayEntry[] = [];
      for (const [k, e] of entries) {
        if (!k.startsWith(prefix) || e.op !== 'put' || !e.doc || seen.has(e.doc.id)) continue;
        extra.push(e);
      }
      extra.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
      for (const e of extra) out.push(e.doc as Doc);
      return clone(out) as T[];
    },

    async get<T extends Doc>(coll: CollectionName, id: string): Promise<T | undefined> {
      const base = await loadSeed(coll);
      const found = lookup(coll, id, base);
      return found ? (clone(found) as T) : undefined;
    },

    async put<T extends Doc>(coll: CollectionName, doc: T): Promise<T> {
      await putEntry(coll, clone(doc));
      return clone(doc);
    },

    async patch<T extends Doc>(coll: CollectionName, id: string, partial: Partial<T>): Promise<T> {
      const base = await loadSeed(coll);
      // Everything from here to putEntry() is synchronous, so concurrent patches
      // each merge against the latest in-memory state.
      const current = lookup(coll, id, base);
      if (!current) throw new Error('not found');
      const next = { ...clone(current), ...clone(partial), id } as T;
      const written = putEntry(coll, next);
      await written;
      return clone(next);
    },

    async remove(coll, id) {
      await persist(key(coll, id), { op: 'del', seq: nextSeq++ });
    },

    async reset() {
      entries = new Map();
      nextSeq = 1;
      if (!overlay) return;
      try {
        await overlay.clear();
        await overlay.setMeta('seedVersion', seedVersion);
      } catch {
        persistent = false;
        overlay = null;
      }
    },

    get persistent() {
      return persistent;
    },
  };
}

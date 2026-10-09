import type { CollectionName, Db, Doc, OverlayEntry, OverlayStore, SeedSource } from '../types';

const isEntry = (e: unknown): e is OverlayEntry => {
  if (!e || typeof e !== 'object') return false;
  const { op, doc } = e as OverlayEntry;
  if (op === 'del') return true;
  return op === 'put' && !!doc && typeof doc.id === 'string';
};

export async function createDb(opts: {
  seed: SeedSource;
  overlay: OverlayStore | null;
  seedVersion: string;
}): Promise<Db> {
  const { seed, seedVersion } = opts;
  let overlay = opts.overlay;
  let entries = new Map<string, OverlayEntry>();

  if (overlay) {
    try {
      await overlay.open();
      const raw = await overlay.all();
      if ((await overlay.getMeta('seedVersion')) !== seedVersion) {
        await overlay.clear();
        await overlay.setMeta('seedVersion', seedVersion);
      } else {
        for (const [k, entry] of raw) if (isEntry(entry)) entries.set(k, entry);
      }
    } catch {
      overlay = null;
      entries = new Map();
    }
  }

  let persistent = overlay !== null;
  const seedCache = new Map<CollectionName, Doc[]>();

  const loadSeed = async (coll: CollectionName): Promise<Doc[]> => {
    let docs = seedCache.get(coll);
    if (!docs) {
      docs = await seed.load(coll);
      seedCache.set(coll, docs);
    }
    return docs;
  };

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

  async function list<T extends Doc>(coll: CollectionName): Promise<T[]> {
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
    for (const [k, e] of entries) {
      if (!k.startsWith(prefix) || e.op !== 'put' || !e.doc || seen.has(e.doc.id)) continue;
      out.push(e.doc);
    }
    return out as T[];
  }

  async function get<T extends Doc>(coll: CollectionName, id: string): Promise<T | undefined> {
    const e = entries.get(key(coll, id));
    if (e) return e.op === 'put' ? (e.doc as T | undefined) : undefined;
    return (await loadSeed(coll)).find((d) => d.id === id) as T | undefined;
  }

  return {
    list,
    get,
    async put<T extends Doc>(coll: CollectionName, doc: T): Promise<T> {
      await persist(key(coll, doc.id), { op: 'put', doc });
      return doc;
    },
    async patch<T extends Doc>(coll: CollectionName, id: string, partial: Partial<T>): Promise<T> {
      const current = await get<T>(coll, id);
      if (!current) throw new Error('not found');
      const next = { ...current, ...partial, id } as T;
      await persist(key(coll, id), { op: 'put', doc: next });
      return next;
    },
    async remove(coll, id) {
      await persist(key(coll, id), { op: 'del' });
    },
    async reset() {
      entries = new Map();
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

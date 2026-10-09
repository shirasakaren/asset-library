import type { OverlayEntry, OverlayStore } from '../types';

const DB_NAME = 'mgm-preview';
const OVERLAY = 'overlay';
const META = 'meta';

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

export function createIdbOverlay(): OverlayStore {
  let db: IDBDatabase | null = null;

  const need = (): IDBDatabase => {
    if (!db) throw new Error('overlay not open');
    return db;
  };

  return {
    open() {
      return new Promise<void>((resolve, reject) => {
        if (typeof indexedDB === 'undefined' || !indexedDB) {
          reject(new Error('indexedDB unavailable'));
          return;
        }
        let req: IDBOpenDBRequest;
        try {
          req = indexedDB.open(DB_NAME, 1);
        } catch (e) {
          reject(e);
          return;
        }
        req.onupgradeneeded = () => {
          const d = req.result;
          d.createObjectStore(OVERLAY, { keyPath: 'key' });
          d.createObjectStore(META, { keyPath: 'k' });
        };
        req.onsuccess = () => {
          db = req.result;
          resolve();
        };
        req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
        req.onblocked = () => reject(new Error('IndexedDB open blocked'));
      });
    },

    async all() {
      const rows = await wrap(
        need().transaction(OVERLAY, 'readonly').objectStore(OVERLAY).getAll() as IDBRequest<
          Array<{ key: string } & OverlayEntry>
        >,
      );
      const out = new Map<string, OverlayEntry>();
      for (const row of rows) out.set(row.key, { op: row.op, doc: row.doc });
      return out;
    },

    async set(key, entry) {
      const tx = need().transaction(OVERLAY, 'readwrite');
      tx.objectStore(OVERLAY).put({ key, ...entry });
      await txDone(tx);
    },

    async clear() {
      const tx = need().transaction(OVERLAY, 'readwrite');
      tx.objectStore(OVERLAY).clear();
      await txDone(tx);
    },

    async getMeta(k) {
      const row = await wrap(
        need().transaction(META, 'readonly').objectStore(META).get(k) as IDBRequest<
          { k: string; v: string } | undefined
        >,
      );
      return row?.v;
    },

    async setMeta(k, v) {
      const tx = need().transaction(META, 'readwrite');
      tx.objectStore(META).put({ k, v });
      await txDone(tx);
    },
  };
}

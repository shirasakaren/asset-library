/**
 * Per-visitor blob storage for the static preview: the bytes of files a visitor "uploads"
 * (package files, thumbnails, editor media). Lives in its own IndexedDB database, separate from
 * the record overlay (`mgm-preview`), so wiping one never half-wipes the other by accident.
 *
 * ## Ids
 *
 * The id is the path of the simulated `preview://` PUT URL:
 *  - `preview://<uploadId>`            -> id `<uploadId>` (single-shot file, thumbnail, editor media)
 *  - `preview://<uploadId>/part/<n>`   -> id `<uploadId>/part/<n>` (multipart part)
 *
 * ## The 5 MB rule
 *
 * Anything above `BLOB_STORE_MAX_BYTES` keeps ONLY a metadata row (`stored: false`, no bytes):
 * the demo must not fill the visitor's disk. Download then serves a generated placeholder text.
 *
 * ## Storage format
 *
 * Bytes are kept as an `ArrayBuffer` (plus the MIME type), not as a `Blob`: it is portable across
 * browsers (older Safari had Blob-in-IndexedDB bugs) and testable, and `get` rebuilds a `Blob`.
 *
 * ## Failure modes
 *
 * No `indexedDB`, an open that throws, is blocked or times out: the store silently switches to an
 * in-memory `Map` (`persistent === false`, data is lost on reload). Errors of individual
 * operations on an open database (for example a full disk) are NOT swallowed: the caller (the
 * upload) fails with a visible error.
 */

export const BLOB_STORE_MAX_BYTES = 5 * 1024 * 1024;

const DB_NAME = 'mgm-preview-blobs';
const STORE = 'blobs';
const DEFAULT_OPEN_TIMEOUT_MS = 4000;

/** What every entry knows about itself (no bytes). */
export interface BlobMeta {
  id: string;
  size: number;
  type: string;
  /** false: only the metadata was kept (blob over 5 MB, or `putMetadata`). */
  stored: boolean;
  createdAt: string;
}

export interface BlobEntry extends BlobMeta {
  /** The bytes, or `null` when `stored` is false. */
  blob: Blob | null;
}

export interface BlobStore {
  /** false once the store runs on the in-memory fallback. Meaningful after the first operation. */
  readonly persistent: boolean;
  /** Stores a blob (metadata only when it is over 5 MB). `meta.type` overrides `blob.type`. */
  put(id: string, blob: Blob, meta?: { type?: string }): Promise<BlobMeta>;
  /** Records an entry without bytes (a multipart upload too big to keep). */
  putMetadata(id: string, meta: { size: number; type?: string }): Promise<BlobMeta>;
  get(id: string): Promise<BlobEntry | undefined>;
  delete(id: string): Promise<void>;
  /** Deletes every entry whose id starts with `prefix`. */
  deleteByPrefix(prefix: string): Promise<void>;
  clear(): Promise<void>;
  list(): Promise<BlobMeta[]>;
}

interface Row extends BlobMeta {
  buffer: ArrayBuffer | null;
}

interface Backend {
  persistent: boolean;
  put(row: Row): Promise<void>;
  get(id: string): Promise<Row | undefined>;
  delete(id: string): Promise<void>;
  clear(): Promise<void>;
  all(): Promise<Row[]>;
}

function memoryBackend(): Backend {
  const rows = new Map<string, Row>();
  return {
    persistent: false,
    async put(row) {
      rows.set(row.id, row);
    },
    async get(id) {
      return rows.get(id);
    },
    async delete(id) {
      rows.delete(id);
    },
    async clear() {
      rows.clear();
    },
    async all() {
      return [...rows.values()];
    },
  };
}

const wrap = <T>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });

const txDone = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });

function openDatabase(factory: IDBFactory, timeoutMs: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (e: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(e);
    };
    const timer = setTimeout(() => fail(new Error('IndexedDB open timed out')), timeoutMs);
    let req: IDBOpenDBRequest;
    try {
      req = factory.open(DB_NAME, 1);
    } catch (e) {
      fail(e);
      return;
    }
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => {
      if (settled) {
        // Already gave up (blocked / timed out): do not leak the connection.
        req.result.close();
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(req.result);
    };
    req.onerror = () => fail(req.error ?? new Error('IndexedDB open failed'));
    req.onblocked = () => fail(new Error('IndexedDB open blocked'));
  });
}

function idbBackend(db: IDBDatabase): Backend {
  const objectStore = (mode: IDBTransactionMode) => {
    const tx = db.transaction(STORE, mode);
    return { tx, os: tx.objectStore(STORE) };
  };
  return {
    persistent: true,
    async put(row) {
      const { tx, os } = objectStore('readwrite');
      os.put(row);
      await txDone(tx);
    },
    async get(id) {
      return (await wrap(objectStore('readonly').os.get(id))) as Row | undefined;
    },
    async delete(id) {
      const { tx, os } = objectStore('readwrite');
      os.delete(id);
      await txDone(tx);
    },
    async clear() {
      const { tx, os } = objectStore('readwrite');
      os.clear();
      await txDone(tx);
    },
    async all() {
      return (await wrap(objectStore('readonly').os.getAll())) as Row[];
    },
  };
}

function readBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer();
  // jsdom and very old browsers.
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the blob'));
    reader.readAsArrayBuffer(blob);
  });
}

const toMeta = (row: Row): BlobMeta => ({
  id: row.id,
  size: row.size,
  type: row.type,
  stored: row.stored,
  createdAt: row.createdAt,
});

export interface BlobStoreOptions {
  /** Defaults to the global `indexedDB`; `null` forces the in-memory fallback. */
  factory?: IDBFactory | null;
  openTimeoutMs?: number;
}

export function createBlobStore(options: BlobStoreOptions = {}): BlobStore {
  let backendPromise: Promise<Backend> | null = null;
  let backend: Backend | null = null;

  const open = (): Promise<Backend> => {
    if (!backendPromise) {
      backendPromise = (async () => {
        const factory =
          options.factory !== undefined
            ? options.factory
            : typeof indexedDB === 'undefined'
              ? null
              : indexedDB;
        let b: Backend;
        if (!factory) {
          b = memoryBackend();
        } else {
          try {
            b = idbBackend(
              await openDatabase(factory, options.openTimeoutMs ?? DEFAULT_OPEN_TIMEOUT_MS),
            );
          } catch {
            b = memoryBackend();
          }
        }
        backend = b;
        return b;
      })();
    }
    return backendPromise;
  };

  const now = () => new Date().toISOString();

  return {
    get persistent() {
      return backend?.persistent ?? false;
    },

    async put(id, blob, meta) {
      const b = await open();
      const type = meta?.type ?? blob.type ?? '';
      const stored = blob.size <= BLOB_STORE_MAX_BYTES;
      const row: Row = {
        id,
        size: blob.size,
        type,
        stored,
        createdAt: now(),
        buffer: stored ? await readBuffer(blob) : null,
      };
      await b.put(row);
      return toMeta(row);
    },

    async putMetadata(id, meta) {
      const b = await open();
      const row: Row = {
        id,
        size: meta.size,
        type: meta.type ?? '',
        stored: false,
        createdAt: now(),
        buffer: null,
      };
      await b.put(row);
      return toMeta(row);
    },

    async get(id) {
      const row = await (await open()).get(id);
      if (!row) return undefined;
      return {
        ...toMeta(row),
        blob: row.stored && row.buffer ? new Blob([row.buffer], { type: row.type }) : null,
      };
    },

    async delete(id) {
      await (await open()).delete(id);
    },

    async deleteByPrefix(prefix) {
      const b = await open();
      for (const row of await b.all()) {
        if (row.id.startsWith(prefix)) await b.delete(row.id);
      }
    },

    async clear() {
      await (await open()).clear();
    },

    async list() {
      return (await (await open()).all()).map(toMeta);
    },
  };
}

let shared: BlobStore | null = null;

/** The app-wide store (lazily created; opens its database on first use). */
export function getBlobStore(): BlobStore {
  if (!shared) shared = createBlobStore();
  return shared;
}

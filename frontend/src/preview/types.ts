export type CollectionName =
  | 'assets'
  | 'users'
  | 'categories'
  | 'tags'
  | 'licenses'
  | 'comments'
  | 'notifications'
  | 'requests'
  | 'reports'
  | 'library'
  | 'audit'
  | 'featured'
  | 'devices'
  | 'webhooks'
  | 'storage'
  | 'analytics'
  | 'kv';

export interface Doc {
  id: string;
}

export interface SeedSource {
  load(coll: CollectionName): Promise<Doc[]>;
}

export interface OverlayEntry {
  op: 'put' | 'del';
  doc?: Doc;
  /** monotonic creation sequence; used to keep overlay-only docs in creation order */
  seq?: number;
}

export interface OverlayStore {
  open(): Promise<void>;
  /** key = `${coll}/${id}` */
  all(): Promise<Map<string, OverlayEntry>>;
  set(key: string, entry: OverlayEntry): Promise<void>;
  clear(): Promise<void>;
  getMeta(k: string): Promise<string | undefined>;
  setMeta(k: string, v: string): Promise<void>;
}

export interface Db {
  list<T extends Doc>(coll: CollectionName): Promise<T[]>;
  get<T extends Doc>(coll: CollectionName, id: string): Promise<T | undefined>;
  put<T extends Doc>(coll: CollectionName, doc: T): Promise<T>;
  patch<T extends Doc>(coll: CollectionName, id: string, partial: Partial<T>): Promise<T>;
  remove(coll: CollectionName, id: string): Promise<void>;
  reset(): Promise<void>;
  /** false => in-memory fallback (IndexedDB unavailable or failing) */
  readonly persistent: boolean;
}

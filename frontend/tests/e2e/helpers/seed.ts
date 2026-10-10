import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Read-only access to the shipped seed JSON, so specs can pick fixtures
 * ("an asset someone else owns that the persona has not saved") instead of
 * hard-coding titles that a reseed would change.
 */
const DIR = join(__dirname, '..', '..', '..', 'src', 'preview', 'seed-data');

export const PERSONA_ID = 'u-persona';
export const PERSONA_NAME = 'Aria Wijaya';

export interface SeedAsset {
  id: string;
  slug: string;
  title: string;
  originalTitle?: string;
  ownerId: string;
  categoryId: string;
  engine: string;
  status: 'PUBLISHED' | 'ARCHIVED' | 'DRAFT';
  titleI18n?: { en?: string; id?: string };
  totalDownloads: number;
}

export interface SeedUser {
  id: string;
  displayName: string;
  role: string;
}

function read<T>(name: string): T {
  return JSON.parse(readFileSync(join(DIR, `${name}.json`), 'utf8')) as T;
}

export const seedAssets = (): SeedAsset[] => read<SeedAsset[]>('assets');
export const seedUsers = (): SeedUser[] => read<SeedUser[]>('users');
export const seedLibraryIds = (): Set<string> =>
  new Set(read<{ id: string }[]>('library').map((r) => r.id));

/**
 * A published asset owned by someone else that the persona has not saved
 * (so "Save" starts unsaved). `skip` picks the nth match for tests that need
 * more than one distinct asset.
 */
export function pickOthersAsset(skip = 0): SeedAsset {
  const saved = seedLibraryIds();
  const match = seedAssets()
    .filter((a) => a.status === 'PUBLISHED' && a.ownerId !== PERSONA_ID && !saved.has(a.id))
    .sort((a, b) => b.totalDownloads - a.totalDownloads)[skip];
  if (!match) throw new Error('no suitable seeded asset');
  return match;
}

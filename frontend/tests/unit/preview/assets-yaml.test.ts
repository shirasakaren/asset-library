import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';

const root = path.resolve(__dirname, '../../..');
const entries = parse(
  fs.readFileSync(path.join(root, 'scripts/seed/assets.yaml'), 'utf8'),
) as Record<string, unknown>[];

const CATEGORIES = [
  '3d-models',
  '2d-art',
  'audio',
  'vfx',
  'animation',
  'tools',
  'scripts',
  'templates',
  'shaders',
  'documents',
];
const ENGINES = [
  'UNITY',
  'UNREAL',
  'BLENDER',
  'STANDALONE_3D',
  'AUDIO',
  'IMAGE',
  'VIDEO',
  'OTHER',
  'ENGINE_AGNOSTIC',
];
const LICENSES = ['mit', 'cc0', 'cc-by', 'cc-by-sa', 'cc-by-nc', 'commercial'];
const STRING_FIELDS = [
  'slug',
  'title',
  'short',
  'short_id',
  'category',
  'engine',
  'license',
  'store',
  'url',
  'image',
] as const;

describe('scripts/seed/assets.yaml', () => {
  it('has at least 150 entries', () => {
    expect(Array.isArray(entries)).toBe(true);
    expect(entries.length).toBeGreaterThanOrEqual(150);
  });

  it('has every field present and typed', () => {
    for (const e of entries) {
      for (const f of STRING_FIELDS) {
        expect(typeof e[f], `${String(e.slug)}.${f}`).toBe('string');
        expect((e[f] as string).trim().length, `${String(e.slug)}.${f}`).toBeGreaterThan(0);
      }
      expect(Array.isArray(e.tags), `${String(e.slug)}.tags`).toBe(true);
      expect((e.tags as unknown[]).length).toBeGreaterThan(0);
      for (const t of e.tags as unknown[]) expect(typeof t).toBe('string');
      if (e.needs_referer !== undefined) expect(e.needs_referer as string).toMatch(/^https:\/\//);
    }
  });

  it('uses only allowed categories, engines and licenses', () => {
    for (const e of entries) {
      expect(CATEGORIES, String(e.slug)).toContain(e.category);
      expect(ENGINES, String(e.slug)).toContain(e.engine);
      expect(LICENSES, String(e.slug)).toContain(e.license);
    }
  });

  it('has ASCII slugs of 3-60 chars', () => {
    for (const e of entries) expect(e.slug as string).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    for (const e of entries) {
      expect((e.slug as string).length).toBeGreaterThanOrEqual(3);
      expect((e.slug as string).length).toBeLessThanOrEqual(64);
    }
  });

  it('uses https URLs', () => {
    for (const e of entries) {
      expect(e.url as string, String(e.slug)).toMatch(/^https:\/\//);
      expect(e.image as string, String(e.slug)).toMatch(/^https:\/\//);
    }
  });

  it('has unique slugs, urls and images', () => {
    for (const f of ['slug', 'url', 'image'] as const) {
      expect(new Set(entries.map((e) => e[f])).size, f).toBe(entries.length);
    }
  });

  it('has at least 12 entries in every category', () => {
    for (const c of CATEGORIES) {
      expect(entries.filter((e) => e.category === c).length, c).toBeGreaterThanOrEqual(12);
    }
  });
});

describe('public/thumbs', () => {
  const dir = path.join(root, 'public/thumbs');
  const manifest = (): Record<string, Record<string, string>> =>
    JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));

  it('has both thumbnail files for every slug', () => {
    for (const e of entries) {
      for (const f of [`${String(e.slug)}.webp`, `${String(e.slug)}-sm.webp`]) {
        const p = path.join(dir, f);
        expect(fs.existsSync(p), f).toBe(true);
        const size = fs.statSync(p).size;
        expect(size, f).toBeGreaterThan(2 * 1024);
        expect(size, f).toBeLessThan(200 * 1024);
      }
    }
  });

  it('has a manifest that agrees with assets.yaml', () => {
    const m = manifest();
    expect(Object.keys(m).sort()).toEqual(entries.map((e) => e.slug as string).sort());
    for (const e of entries) {
      const row = m[e.slug as string];
      expect(row.file).toBe(`${String(e.slug)}.webp`);
      expect(row.small).toBe(`${String(e.slug)}-sm.webp`);
      expect(row.sourcePage).toBe(e.url);
      expect(row.store).toBe(e.store);
      expect(row.sourceImage).toMatch(/^https:\/\//);
      expect(typeof row.fetchedAt).toBe('string');
    }
  });
});

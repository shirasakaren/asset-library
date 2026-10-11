/* eslint-disable no-console -- CLI script */
/**
 * ONE-SHOT PROVENANCE TOOL. Merge the curated candidate lists into `assets.yaml`.
 *
 * `assets.yaml` was produced by this script once and has been edited since
 * (removals, replacement images); it is now the maintained source of truth.
 * The curated input files are not kept in the repository, so this cannot
 * reproduce the current catalog, and running it with `--out` pointing at
 * `assets.yaml` would overwrite those edits. Use it only to rebuild a catalog
 * from fresh candidate lists.
 *
 *   tsx scripts/seed/merge-curated.ts <a.yaml> <b.yaml> <c.yaml> \
 *     [--out scripts/seed/assets.yaml] [--leftover <leftover.yaml>] [--cap 18]
 *
 * Deterministic for a given set of inputs (the merge itself is stable).
 *  - near-duplicates (same url, same image, or same normalised title) are dropped
 *  - at most `cap` entries per category, picked round-robin across stores so no
 *    single seller dominates (Unity Asset Store, Fab, Sketchfab and BOOTH first)
 *  - every entry gets a unique ASCII `slug`
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Document, parse, visit, isSeq } from 'yaml';

export interface CuratedEntry {
  slug?: string;
  title: string;
  short: string;
  short_id: string;
  category: string;
  engine: string;
  tags: string[];
  license: string;
  store: string;
  url: string;
  image: string;
  needs_referer?: string;
}

export const CATEGORIES = [
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
] as const;

const PRIORITY_STORES = ['Unity Asset Store', 'Fab', 'Sketchfab', 'BOOTH'];

const HEADER = `# Demo catalog for the static preview.
#
# Origin: curated from real listings on public asset stores (Unity Asset Store,
# Fab, Sketchfab, BOOTH, itch.io, Kenney, Poly Pizza, OpenGameArt, ...).
# The thumbnails (public/thumbs) are downsized copies of the stores' own
# listing images. They belong to their respective creators, are used here only
# to demonstrate the product, and every asset links back to its original page.
#
# This file is the maintained source of truth for the demo catalog: edit it
# directly. It was first assembled from curated candidate lists by the one-shot
# tool scripts/seed/merge-curated.ts (kept for provenance; re-running it would
# overwrite later edits). Later removals and fallback images are recorded in
# scripts/seed/substitutions.json. Thumbnails are produced from this file by
# scripts/seed/thumbs.ts, and the seed JSON by scripts/seed/build-seed.ts.
`;

export function asciiSlug(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
}

export function baseSlug(e: Pick<CuratedEntry, 'title' | 'store' | 'url'>): string {
  const s = asciiSlug(e.title);
  if (s.length >= 3) return s;
  const storeShort = asciiSlug(e.store).split('-')[0] || 'asset';
  const ids = e.url.match(/\d+/g);
  const id = ids
    ? ids[ids.length - 1]
    : crypto.createHash('sha1').update(e.url).digest('hex').slice(0, 8);
  return `${storeShort}-${id}`;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\u0080-￿]+/g, '');

function dedupe(entries: CuratedEntry[]): CuratedEntry[] {
  const urls = new Set<string>();
  const images = new Set<string>();
  const titles = new Set<string>();
  const out: CuratedEntry[] = [];
  for (const e of entries) {
    const t = norm(e.title);
    if (urls.has(e.url) || images.has(e.image) || titles.has(t)) continue;
    urls.add(e.url);
    images.add(e.image);
    titles.add(t);
    out.push(e);
  }
  return out;
}

function pickCategory(
  entries: CuratedEntry[],
  cap: number,
): { kept: CuratedEntry[]; left: CuratedEntry[] } {
  const buckets = new Map<string, CuratedEntry[]>();
  for (const e of entries) {
    if (!buckets.has(e.store)) buckets.set(e.store, []);
    buckets.get(e.store)!.push(e);
  }
  const order = [
    ...PRIORITY_STORES.filter((s) => buckets.has(s)),
    ...[...buckets.keys()].filter((s) => !PRIORITY_STORES.includes(s)),
  ];
  const kept: CuratedEntry[] = [];
  let progressed = true;
  while (kept.length < cap && progressed) {
    progressed = false;
    for (const s of order) {
      const b = buckets.get(s)!;
      // priority stores get two picks per round so they keep a healthy share
      const picks = PRIORITY_STORES.includes(s) ? 2 : 1;
      for (let i = 0; i < picks && b.length && kept.length < cap; i++) {
        kept.push(b.shift()!);
        progressed = true;
      }
    }
  }
  const left = order.flatMap((s) => buckets.get(s)!);
  return { kept, left };
}

export function assignSlugs(entries: CuratedEntry[]): CuratedEntry[] {
  const used = new Set<string>();
  return entries.map((e) => {
    const base = baseSlug(e);
    let slug = base;
    for (let n = 2; used.has(slug); n++) slug = `${base}-${n}`.replace(/^(.{60}).*(-\d+)$/, '$1$2');
    used.add(slug);
    return { ...e, slug };
  });
}

const FIELD_ORDER: (keyof CuratedEntry)[] = [
  'slug',
  'title',
  'short',
  'short_id',
  'category',
  'engine',
  'tags',
  'license',
  'store',
  'url',
  'image',
  'needs_referer',
];

function ordered(e: CuratedEntry): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  for (const k of FIELD_ORDER) if (e[k] !== undefined) o[k] = e[k];
  return o;
}

export function toYaml(entries: CuratedEntry[], header = ''): string {
  const doc = new Document(entries.map(ordered));
  visit(doc, {
    Pair(_k, pair) {
      if ((pair.key as { value?: unknown })?.value === 'tags' && isSeq(pair.value))
        pair.value.flow = true;
    },
  });
  return header + doc.toString({ lineWidth: 0 });
}

function main(): void {
  const args = process.argv.slice(2);
  const files: string[] = [];
  let out = 'scripts/seed/assets.yaml';
  let leftover: string | undefined;
  let cap = 18;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--out') out = args[++i];
    else if (args[i] === '--leftover') leftover = args[++i];
    else if (args[i] === '--cap') cap = Number(args[++i]);
    else files.push(args[i]);
  }
  if (files.length === 0)
    throw new Error(
      'usage: merge-curated.ts <a.yaml> <b.yaml> <c.yaml> [--out f] [--leftover f] [--cap n]',
    );

  const all = dedupe(files.flatMap((f) => parse(fs.readFileSync(f, 'utf8')) as CuratedEntry[]));
  const kept: CuratedEntry[] = [];
  const left: CuratedEntry[] = [];
  for (const cat of CATEGORIES) {
    const r = pickCategory(
      all.filter((e) => e.category === cat),
      cap,
    );
    kept.push(...r.kept);
    left.push(...r.left);
  }
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, toYaml(assignSlugs(kept), HEADER));
  if (leftover) fs.writeFileSync(leftover, toYaml(left));
  console.log(
    `merged ${all.length} unique candidates -> ${kept.length} kept, ${left.length} left over`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename ?? '')) main();

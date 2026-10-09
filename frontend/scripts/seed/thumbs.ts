/* eslint-disable no-console -- CLI script */
/**
 * Download the listing image of every entry in assets.yaml and bundle it as
 * WebP thumbnails.
 *
 *   tsx scripts/seed/thumbs.ts [--prune] [--quality 78]
 *                              [--remove slug1,slug2 --reason "why"]
 *
 * For each entry: `public/thumbs/<slug>.webp` (640x400, cover) and
 * `public/thumbs/<slug>-sm.webp` (320x200), plus `public/thumbs/manifest.json`.
 * Existing files are skipped, so re-runs are idempotent and the manifest does
 * not churn (`fetchedAt` is only set when a file is newly downloaded).
 *
 * Failed downloads get one automatic fallback (the `og:image` of the listing
 * page). With `--prune`, entries that still fail are removed from assets.yaml.
 * `--remove` drops entries by slug (manual curation decisions, e.g. an unsuitable
 * image) and records them with the given reason. Fallbacks and removals are logged to substitutions.json and rendered to
 * SUBSTITUTIONS.md.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseDocument, isMap, type YAMLSeq } from 'yaml';
import sharp from 'sharp';

const ROOT = path.resolve(__dirname, '../..');
const YAML_PATH = path.join(__dirname, 'assets.yaml');
const OUT_DIR = path.join(ROOT, 'public/thumbs');
const MANIFEST_PATH = path.join(OUT_DIR, 'manifest.json');
const SUBS_JSON = path.join(__dirname, 'substitutions.json');
const SUBS_MD = path.join(__dirname, 'SUBSTITUTIONS.md');

const MIN_SUCCESS = 100;
const MIN_BYTES = 3000;
const CONCURRENCY = 6;
const RETRIES = 3;
const TIMEOUT_MS = 20_000;
const UNKNOWN_DATE = '1970-01-01T00:00:00.000Z';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

interface Entry {
  slug: string;
  title: string;
  store: string;
  url: string;
  image: string;
  needs_referer?: string;
}
interface ManifestRow {
  file: string;
  small: string;
  sourceImage: string;
  sourcePage: string;
  store: string;
  fetchedAt: string;
}
interface SubstitutionRow {
  slug: string;
  title: string;
  store: string;
  url: string;
  action: 'og-image' | 'removed' | 'removed-manual' | 'added-replacement';
  originalImage?: string;
  newImage?: string;
  reason: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchWithRetry(
  url: string,
  headers: Record<string, string>,
  accept: (res: Response, body: Buffer) => string | null,
): Promise<Buffer> {
  let lastErr = 'unknown error';
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        headers,
        redirect: 'follow',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) {
        lastErr = `HTTP ${res.status}`;
        if (res.status === 404 || res.status === 410) break;
      } else {
        const body = Buffer.from(await res.arrayBuffer());
        const problem = accept(res, body);
        if (!problem) return body;
        lastErr = problem;
      }
    } catch (e) {
      lastErr =
        e instanceof Error ? (e.name === 'TimeoutError' ? 'timeout' : e.message) : String(e);
    }
    if (attempt < RETRIES) await sleep(800 * 2 ** (attempt - 1));
  }
  throw new Error(lastErr);
}

function downloadImage(url: string, referer?: string): Promise<Buffer> {
  const headers: Record<string, string> = {
    'User-Agent': UA,
    Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
  };
  if (referer) headers.Referer = referer;
  return fetchWithRetry(url, headers, (res, body) => {
    const type = res.headers.get('content-type') ?? '';
    if (!type.toLowerCase().startsWith('image/')) return `not an image (content-type "${type}")`;
    if (body.length <= MIN_BYTES) return `image too small (${body.length} bytes)`;
    return null;
  });
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&#38;/g, '&')
    .replace(/&#x2F;/g, '/')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

async function findOgImage(pageUrl: string): Promise<string> {
  const html = (
    await fetchWithRetry(
      pageUrl,
      {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      () => null,
    )
  ).toString('utf8');
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const prop of ['og:image:secure_url', 'og:image', 'twitter:image']) {
    for (const tag of tags) {
      const key = tag.match(/\b(?:property|name)\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase();
      if (key !== prop) continue;
      const content = tag.match(/\bcontent\s*=\s*["']([^"']+)["']/i)?.[1];
      if (content) return new URL(decodeEntities(content), pageUrl).toString();
    }
  }
  throw new Error('no og:image on listing page');
}

async function writeThumbs(buf: Buffer, slug: string, quality: number): Promise<void> {
  const base = () => sharp(buf, { failOn: 'none' }).rotate().flatten({ background: '#f4f4f5' });
  await base()
    .resize(640, 400, { fit: 'cover', position: 'centre' })
    .webp({ quality })
    .toFile(path.join(OUT_DIR, `${slug}.webp`));
  await base()
    .resize(320, 200, { fit: 'cover', position: 'centre' })
    .webp({ quality })
    .toFile(path.join(OUT_DIR, `${slug}-sm.webp`));
}

async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (i < items.length) await fn(items[i++]);
    }),
  );
}

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

function renderSubstitutions(rows: SubstitutionRow[]): string {
  const sorted = [...rows].sort((a, b) => a.slug.localeCompare(b.slug));
  const esc = (s: string) => s.replace(/\|/g, '\\|');
  const section = (
    title: string,
    intro: string,
    list: SubstitutionRow[],
    line: (r: SubstitutionRow) => string,
  ) => (list.length === 0 ? '' : `## ${title}\n\n${intro}\n\n${list.map(line).join('\n')}\n\n`);
  return (
    `# Thumbnail substitutions\n\n` +
    `Generated by \`scripts/seed/thumbs.ts\` from \`substitutions.json\`. Lists every curated\n` +
    `entry whose listing image could not be used as curated.\n\n` +
    `Summary: ${rows.filter((r) => r.action === 'og-image').length} image(s) replaced via og:image, ` +
    `${rows.filter((r) => r.action === 'removed').length} removed after failed downloads, ` +
    `${rows.filter((r) => r.action === 'removed-manual').length} removed during curation review.\n\n` +
    section(
      'Image replaced by the listing page og:image',
      'The curated image URL failed; the listing page was fetched and its `og:image` used instead. The entry stays in the catalog and `assets.yaml` now points at the new image.',
      sorted.filter((r) => r.action === 'og-image'),
      (r) =>
        `- **${esc(r.title)}** (${r.store}, \`${r.slug}\`): ${r.reason}. Now using ${r.newImage}`,
    ) +
    section(
      'Entries removed from the catalog',
      'Either no usable image could be obtained (including the og:image fallback) or the image or content was judged unsuitable for a public demo, so the entry was removed.',
      sorted.filter((r) => r.action === 'removed' || r.action === 'removed-manual'),
      (r) => `- **${esc(r.title)}** (${r.store}, ${r.url}): ${r.reason}`,
    ) +
    section(
      'Replacement entries added',
      'Added from the leftover curated candidates to keep every category at 12 or more entries.',
      sorted.filter((r) => r.action === 'added-replacement'),
      (r) => `- **${esc(r.title)}** (${r.store}, \`${r.slug}\`): ${r.reason}`,
    ) +
    (rows.length === 0 ? 'No substitutions were needed.\n' : '')
  ).replace(/\n{3,}/g, '\n\n');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const prune = args.includes('--prune');
  const qIdx = args.indexOf('--quality');
  const quality = qIdx >= 0 ? Number(args[qIdx + 1]) : 78;

  const rmIdx = args.indexOf('--remove');
  const manualRemove = new Set(rmIdx >= 0 ? args[rmIdx + 1].split(',') : []);
  const reasonIdx = args.indexOf('--reason');
  const manualReason = reasonIdx >= 0 ? args[reasonIdx + 1] : 'removed during curation';

  const doc = parseDocument(fs.readFileSync(YAML_PATH, 'utf8'));
  const seq = doc.contents as YAMLSeq;
  const allEntries = doc.toJS() as Entry[];
  const entries = allEntries.filter((e) => !manualRemove.has(e.slug));
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const oldManifest = readJson<Record<string, ManifestRow>>(MANIFEST_PATH, {});
  const manifest: Record<string, ManifestRow> = {};
  const subs = readJson<SubstitutionRow[]>(SUBS_JSON, []);
  const failed: { entry: Entry; reason: string }[] = [];
  const newImages = new Map<string, string>();
  let downloaded = 0;
  let skipped = 0;

  await pool(entries, CONCURRENCY, async (e) => {
    const large = path.join(OUT_DIR, `${e.slug}.webp`);
    const small = path.join(OUT_DIR, `${e.slug}-sm.webp`);
    const row = (sourceImage: string, fetchedAt: string): ManifestRow => ({
      file: `${e.slug}.webp`,
      small: `${e.slug}-sm.webp`,
      sourceImage,
      sourcePage: e.url,
      store: e.store,
      fetchedAt,
    });
    if (fs.existsSync(large) && fs.existsSync(small)) {
      const prev = oldManifest[e.slug];
      manifest[e.slug] = row(prev?.sourceImage ?? e.image, prev?.fetchedAt ?? UNKNOWN_DATE);
      skipped++;
      return;
    }
    let image = e.image;
    let buf: Buffer;
    let primaryErr = '';
    try {
      buf = await downloadImage(image, e.needs_referer);
    } catch (err) {
      primaryErr = (err as Error).message;
      try {
        image = await findOgImage(e.url);
        buf = await downloadImage(image, e.url);
      } catch (err2) {
        const reason = `curated image failed (${primaryErr}); og:image fallback failed (${(err2 as Error).message})`;
        failed.push({ entry: e, reason });
        console.log(`FAIL  ${e.slug}: ${reason}`);
        return;
      }
    }
    try {
      await writeThumbs(buf, e.slug, quality);
    } catch (err) {
      fs.rmSync(large, { force: true });
      fs.rmSync(small, { force: true });
      failed.push({
        entry: e,
        reason: `image could not be decoded/resized (${(err as Error).message})`,
      });
      console.log(`FAIL  ${e.slug}: decode error ${(err as Error).message}`);
      return;
    }
    // Record the og:image fallback only once its thumbnails were written.
    if (primaryErr) {
      newImages.set(e.slug, image);
      const rec: SubstitutionRow = {
        slug: e.slug,
        title: e.title,
        store: e.store,
        url: e.url,
        action: 'og-image',
        originalImage: e.image,
        newImage: image,
        reason: `curated image failed (${primaryErr})`,
      };
      const i = subs.findIndex((s) => s.slug === e.slug);
      if (i >= 0) subs[i] = rec;
      else subs.push(rec);
    }
    manifest[e.slug] = row(image, new Date().toISOString());
    downloaded++;
    console.log(`OK    ${e.slug}${primaryErr ? ' (og:image fallback)' : ''}`);
  });

  const failedSlugs = new Set(failed.map((f) => f.entry.slug));
  // Bail out before touching assets.yaml / substitutions.json when too few
  // thumbnails succeeded, so a bad run (e.g. offline) cannot prune the catalog.
  const okCount = Object.keys(manifest).filter((s) => !failedSlugs.has(s)).length;
  if (okCount < MIN_SUCCESS) {
    for (const f of failed) console.log(`  - ${f.entry.slug} [${f.entry.store}] ${f.reason}`);
    console.error(
      `only ${okCount} thumbnails succeeded; need at least ${MIN_SUCCESS}. ` +
        `assets.yaml, substitutions and manifest were left untouched.`,
    );
    process.exit(1);
  }

  // Persist yaml changes (fallback images, pruned failures).
  let yamlChanged = false;
  for (const item of [...seq.items]) {
    if (!isMap(item)) continue;
    const slug = item.get('slug') as string;
    if (newImages.has(slug)) {
      item.set('image', newImages.get(slug));
      yamlChanged = true;
    }
    if (manualRemove.has(slug)) {
      const e = allEntries.find((x) => x.slug === slug)!;
      subs.push({
        slug,
        title: e.title,
        store: e.store,
        url: e.url,
        action: 'removed-manual',
        originalImage: e.image,
        reason: manualReason,
      });
      seq.items.splice(seq.items.indexOf(item), 1);
      yamlChanged = true;
    } else if (prune && failedSlugs.has(slug)) {
      seq.items.splice(seq.items.indexOf(item), 1);
      yamlChanged = true;
    }
  }
  if (yamlChanged)
    fs.writeFileSync(YAML_PATH, doc.toString({ lineWidth: 0, flowCollectionPadding: false }));
  if (prune) {
    for (const f of failed) {
      subs.push({
        slug: f.entry.slug,
        title: f.entry.title,
        store: f.entry.store,
        url: f.entry.url,
        action: 'removed',
        originalImage: f.entry.image,
        reason: f.reason,
      });
    }
  }
  // Drop thumbnails of entries that are no longer in the catalog.
  const live = new Set(
    entries.filter((e) => !(prune && failedSlugs.has(e.slug))).map((e) => e.slug),
  );
  for (const f of fs.readdirSync(OUT_DIR)) {
    const m = f.match(/^(.+?)(-sm)?\.webp$/);
    if (m && !live.has(m[1])) fs.rmSync(path.join(OUT_DIR, f));
  }
  const sortedManifest = Object.fromEntries(
    Object.keys(manifest)
      .filter((s) => !failedSlugs.has(s))
      .sort()
      .map((s) => [s, manifest[s]]),
  );
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(sortedManifest, null, 2) + '\n');
  fs.writeFileSync(SUBS_JSON, JSON.stringify(subs, null, 2) + '\n');
  fs.writeFileSync(SUBS_MD, renderSubstitutions(subs));

  const ok = Object.keys(sortedManifest).length;
  console.log(
    `\n${ok} ok (${downloaded} downloaded, ${skipped} already present), ${failed.length} failed${
      prune ? ' (pruned from assets.yaml)' : ''
    }`,
  );
  for (const f of failed) console.log(`  - ${f.entry.slug} [${f.entry.store}] ${f.reason}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

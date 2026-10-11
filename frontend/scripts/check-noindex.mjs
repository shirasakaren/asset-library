// Fails when any HTML file of the static export lacks `<meta name="robots" content="...noindex...">`.
//
//   node scripts/check-noindex.mjs [dir=out]
//
// The preview must never be indexed (demo data, third-party thumbnails). The root layout sets
// noindex, but a page-level `robots` metadata entry silently overrides it, so every built page
// (and the 404 shell) is checked, not just the home page.
import fs from 'node:fs';
import path from 'node:path';

const META = /<meta\s+name="robots"\s+content="([^"]*)"/gi;

function* htmlFiles(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* htmlFiles(p);
    else if (e.name.endsWith('.html')) yield p;
  }
}

/** Offending files (relative to `root`) and the number of files checked. */
export function checkNoindex(root) {
  const bad = [];
  let total = 0;
  for (const file of htmlFiles(root)) {
    total++;
    const html = fs.readFileSync(file, 'utf8');
    const contents = [...html.matchAll(META)].map((m) => m[1]);
    // Every robots tag must say noindex (a later "index" would win over an earlier "noindex").
    const ok = contents.length > 0 && contents.every((c) => /(^|[\s,])noindex($|[\s,])/i.test(c));
    if (!ok) {
      bad.push({ file: path.relative(root, file).split(path.sep).join('/'), robots: contents });
    }
  }
  return { bad, total };
}

if (import.meta.url === new URL(`file://${path.resolve(process.argv[1] ?? '')}`).href) {
  const root = path.resolve(process.argv[2] ?? 'out');
  if (!fs.existsSync(root)) {
    console.error(`::error::${root} does not exist (build the export first)`);
    process.exit(1);
  }
  const { bad, total } = checkNoindex(root);
  if (total === 0) {
    console.error(`::error::no HTML files in ${root}`);
    process.exit(1);
  }
  if (bad.length > 0) {
    for (const b of bad) {
      console.error(
        `::error::${b.file}: robots meta ${b.robots.length ? JSON.stringify(b.robots) : 'missing'}, expected noindex`,
      );
    }
    console.error(`${bad.length} of ${total} HTML files are indexable`);
    process.exit(1);
  }
  console.log(`noindex OK: ${total} HTML files`);
}

import { route } from '../router/router';

/**
 * `GET /gifs/search`: an offline stand-in for the Tenor / Giphy proxy. The 16 "GIFs" are tiny
 * animated SVGs built into `data:` URLs, so the picker works without a network and what the
 * editor inserts (the `url`) survives in the saved document.
 */

interface Gif {
  id: string;
  url: string;
  preview: string;
  width: number;
  height: number;
  title: string;
}

const WIDTH = 240;
const HEIGHT = 180;

/** Label, background, accent. */
const SET: readonly (readonly [string, string, string])[] = [
  ['wow', '#3a6dc5', '#f7bf33'],
  ['party', '#c2410c', '#fde68a'],
  ['gg', '#0f8657', '#d1fae5'],
  ['nice', '#7c3aed', '#ddd6fe'],
  ['lol', '#db2777', '#fbcfe8'],
  ['yes', '#15803d', '#bbf7d0'],
  ['no', '#b91c1c', '#fecaca'],
  ['thanks', '#0e7490', '#a5f3fc'],
  ['love', '#be123c', '#fecdd3'],
  ['fire', '#ea580c', '#fed7aa'],
  ['ok', '#475569', '#e2e8f0'],
  ['hype', '#4338ca', '#c7d2fe'],
  ['cool', '#0369a1', '#bae6fd'],
  ['oops', '#a16207', '#fef08a'],
  ['boom', '#1f2937', '#fca5a5'],
  ['sad', '#334155', '#93c5fd'],
];

/** A looping animation: a pulsing disc, a sweeping bar and the label. SMIL works in `<img>`. */
function animatedSvg(label: string, bg: string, accent: string, variant: number): string {
  const dur = 1.2 + (variant % 4) * 0.3;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">` +
    `<rect width="${WIDTH}" height="${HEIGHT}" fill="${bg}"/>` +
    `<circle cx="${WIDTH / 2}" cy="${HEIGHT / 2 - 14}" r="34" fill="${accent}" opacity="0.9">` +
    `<animate attributeName="r" values="26;46;26" dur="${dur}s" repeatCount="indefinite"/>` +
    `<animate attributeName="opacity" values="0.95;0.45;0.95" dur="${dur}s" repeatCount="indefinite"/>` +
    `</circle>` +
    `<rect x="-60" y="${HEIGHT - 26}" width="60" height="8" rx="4" fill="${accent}">` +
    `<animate attributeName="x" values="-60;${WIDTH};-60" dur="${dur * 1.5}s" repeatCount="indefinite"/>` +
    `</rect>` +
    `<text x="${WIDTH / 2}" y="${HEIGHT / 2 - 6}" text-anchor="middle" font-family="sans-serif" ` +
    `font-size="30" font-weight="700" fill="${bg}">${label}</text>` +
    `</svg>`
  );
}

const toDataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

const GIFS: readonly Gif[] = SET.map(([label, bg, accent], i) => {
  const url = toDataUrl(animatedSvg(label, bg, accent, i));
  return {
    id: `preview-gif-${label}`,
    url,
    preview: url,
    width: WIDTH,
    height: HEIGHT,
    title: label,
  };
});

/** Integer query value; anything malformed falls back to `def` (the backend does not 400 here). */
function intQuery(raw: string | null, def: number, min: number, max: number): number {
  const n = raw === null || raw.trim() === '' ? Number.NaN : Number(raw);
  return Number.isFinite(n) ? Math.min(Math.max(Math.trunc(n), min), max) : def;
}

route('GET', '/gifs/search', (req) => {
  const q = (req.query.get('q') ?? '').trim().toLowerCase();
  const limit = intQuery(req.query.get('limit'), 24, 1, 50);
  const pos = intQuery(req.query.get('pos'), 0, 0, Number.MAX_SAFE_INTEGER);
  const matches = q ? GIFS.filter((g) => g.title.includes(q)) : GIFS;
  const page = matches.slice(pos, pos + limit);
  const end = pos + page.length;
  return {
    provider: 'tenor' as const,
    results: page.map((g) => ({ ...g })),
    available: ['tenor' as const],
    // Cursor for the next page (like Tenor's `next`), null at the end.
    next: end < matches.length ? String(end) : null,
  };
});

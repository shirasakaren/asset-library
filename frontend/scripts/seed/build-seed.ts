/* eslint-disable no-console -- CLI script */
/**
 * Deterministic seed generator for the static preview.
 *
 *   tsx scripts/seed/build-seed.ts [--out <dir>]      (pnpm seed:build)
 *
 * Reads `scripts/seed/assets.yaml` (the maintained catalog) and writes one JSON
 * file per collection to `--out` (default `src/preview/seed-data`). The record
 * types and the meaning of every field live in `src/preview/records.ts`; this
 * script is typed against them.
 *
 * Determinism
 *  - Randomness comes only from a mulberry32 stream seeded with 0xA55E7
 *    (`prng.ts`), forked per domain. There is no `Math.random`, `Date.now`,
 *    `new Date()` without arguments, or locale-dependent sorting.
 *  - Every date is derived from the fixed anchor 2026-10-01T00:00:00Z.
 *  - Arrays are sorted explicitly with total orders (plain code-unit
 *    comparison plus an id tiebreak).
 *
 * Output format
 *  - A JSON array with ONE RECORD PER LINE (`[\n<json>,\n<json>\n]\n`, LF line
 *    endings). Keys keep the insertion order of the generator. That keeps diffs
 *    line-based and the files small (no indentation). An empty collection is `[]`.
 *  - The files are excluded from prettier (root `.prettierignore`) so they stay
 *    byte-stable; the integrity test rebuilds and compares them byte for byte.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { rootRng, type Rng } from './prng';
import * as C from './content';
import * as CP from './comment-pools';
import { SEED_VERSION } from '../../src/preview/store/version';
import type {
  AnalyticsRecord,
  AssetAnalyticsRecord,
  AssetRecord,
  AssetVersionRecord,
  AuditRecord,
  CategoryRecord,
  CommentRecord,
  DeviceRecord,
  FeaturedRecord,
  KvMetaRecord,
  LibraryRecord,
  LicenseRecord,
  NotificationRecord,
  PlatformAnalyticsRecord,
  ReportRecord,
  RequestRecord,
  SeedCollections,
  StorageRecord,
  TagRecord,
  UserRecord,
  WebhookDeliveryRecord,
} from '../../src/preview/records';
import type {
  AssetDependency,
  AssetRequestStatus,
  AssetStatus,
  CommentKind,
  CompatibilityRow,
  Engine,
  IssueStatus,
  NotificationType,
  RenderPipeline,
  ServerAvatar,
  TargetPlatform,
  TipTapDoc,
  TipTapNode,
} from '../../src/lib/api/types';
import type { ReportAction, ReportCategory, ReportStatus } from '../../src/lib/api/admin-types';

/* ------------------------------------------------------------------ */
/* Constants and small helpers                                         */
/* ------------------------------------------------------------------ */

const ANCHOR_MS = Date.parse('2026-10-01T00:00:00Z');
const END_DATE = '2026-09-30';
const END_MS = Date.parse(`${END_DATE}T00:00:00Z`);
const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;
const PERSONA_ID = 'u-persona';
const WINDOW_START_MS = Date.parse('2025-04-01T00:00:00Z');

/** Whole-second ISO timestamps: every seeded date has `.000Z`. */
const iso = (ms: number): string => new Date(Math.floor(ms / 1000) * 1000).toISOString();
const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const pad = (n: number, w: number): string => String(n).padStart(w, '0');
const slugify = (s: string): string =>
  s
    .toLowerCase()
    .replace(/\+\+/g, 'pp')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

function fill(tpl: string, vars: Record<string, string>): string {
  return tpl
    .replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '')
    .replace(/ {2,}/g, ' ')
    .replace(/ +([.,])/g, '$1')
    .trim();
}

/** Largest-remainder allocation of `total` over `weights` (sums exactly to `total`). */
function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((s, w) => s + w, 0);
  const raw = weights.map((w) => (total * w) / sum);
  const out = raw.map((r) => Math.floor(r));
  let left = total - out.reduce((s, n) => s + n, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; left > 0; k = (k + 1) % order.length, left--) out[order[k].i]++;
  return out;
}

/* TipTap builders ---------------------------------------------------- */

type Marks = NonNullable<TipTapNode['marks']>;
const t = (text: string, marks?: Marks): TipTapNode =>
  marks ? { type: 'text', text, marks } : { type: 'text', text };
const para = (content: string | TipTapNode[]): TipTapNode => ({
  type: 'paragraph',
  content: typeof content === 'string' ? [t(content)] : content,
});
const heading = (level: 1 | 2 | 3, text: string): TipTapNode => ({
  type: 'heading',
  attrs: { level },
  content: [t(text)],
});
const bullets = (items: string[]): TipTapNode => ({
  type: 'bulletList',
  content: items.map((i) => ({ type: 'listItem', content: [para(i)] })),
});
const doc = (...content: TipTapNode[]): TipTapDoc => ({ type: 'doc', content });

/** Every collection as an array of its record type. */
type SeedData = { [K in keyof SeedCollections]: SeedCollections[K][] };

/* ------------------------------------------------------------------ */
/* Input                                                               */
/* ------------------------------------------------------------------ */

interface Entry {
  slug: string;
  title: string;
  short: string;
  short_id: string;
  category: string;
  engine: Engine;
  tags: string[];
  license: string;
  store: string;
  url: string;
  image: string;
}

function parseArgs(): { out: string } {
  const argv = process.argv.slice(2);
  const i = argv.indexOf('--out');
  const out =
    i >= 0 && argv[i + 1]
      ? path.resolve(argv[i + 1])
      : path.resolve(__dirname, '../../src/preview/seed-data');
  return { out };
}

function loadEntries(): Entry[] {
  const raw = parse(fs.readFileSync(path.join(__dirname, 'assets.yaml'), 'utf8')) as Entry[];
  return [...raw].sort((a, b) => cmp(a.slug, b.slug));
}

/* ------------------------------------------------------------------ */
/* Users, categories, licenses                                         */
/* ------------------------------------------------------------------ */

const AVATAR_BG: ServerAvatar['bgColor'][] = [
  'brand-blue',
  'brand-yellow',
  'brand-red',
  'brand-green',
];

function makeAvatar(name: string, bg: ServerAvatar['bgColor']): ServerAvatar {
  const parts = name.split(' ');
  const initials = (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return { initials, bgColor: bg, fgColor: bg === 'brand-yellow' ? 'ink-black' : 'ink-white' };
}

function buildUsers(rng: Rng, recentDays: number[]): UserRecord[] {
  const users: UserRecord[] = [
    {
      id: PERSONA_ID,
      email: 'aria.wijaya@preview.example',
      displayName: 'Aria Wijaya',
      role: 'admin',
      avatar: makeAvatar('Aria Wijaya', 'brand-blue'),
      createdAt: '2025-06-12T00:00:00.000Z',
      locale: 'en',
      isAdmin: true,
    },
  ];
  // Some plain users signed up in the last 30 days so the admin "new users" chart has data.
  const plain = C.USER_SEEDS.filter((s) => s.role === 'user').map((s) => s.name);
  const recentUsers = new Map(
    rng
      .fork('recent')
      .shuffle(plain)
      .slice(0, recentDays.length)
      .map((n, i) => [n, recentDays[i]] as const),
  );
  const timeRng = rng.fork('recent-time');
  C.USER_SEEDS.forEach((s, i) => {
    const slug = slugify(s.name);
    const early = s.role !== 'user';
    const recentDay = recentUsers.get(s.name);
    users.push({
      id: `u-${slug}`,
      email: `${s.name.toLowerCase().replace(' ', '.')}@preview.example`,
      displayName: s.name,
      role: s.role,
      avatar: makeAvatar(s.name, AVATAR_BG[(i + 1) % 4]),
      createdAt:
        recentDay !== undefined
          ? iso(ANCHOR_MS - recentDay * DAY + timeRng.int(0, 23) * HOUR + timeRng.int(0, 59) * MIN)
          : early
            ? rng.date(Date.parse('2025-03-01T00:00:00Z'), Date.parse('2025-11-20T00:00:00Z'))
            : rng.date(Date.parse('2025-05-01T00:00:00Z'), Date.parse('2026-09-20T00:00:00Z')),
      locale: s.locale,
      isAdmin: s.role === 'admin',
    });
  });
  return users;
}

function buildCategories(): CategoryRecord[] {
  return C.CATEGORY_SEEDS.map((c) => ({
    id: `cat-${c.slug}`,
    slug: c.slug,
    name: { en: c.en, id: c.id },
    iconKey: c.icon,
    sortOrder: c.sortOrder,
    isActive: true,
    createdAt: '2025-01-15T00:00:00.000Z',
    updatedAt: '2025-01-15T00:00:00.000Z',
  }));
}

function buildLicenses(): LicenseRecord[] {
  return C.LICENSE_SEEDS.map((l) => ({
    id: `lic-${l.slug}`,
    slug: l.slug,
    name: l.name,
    description: { en: l.description.en, id: l.description.id },
    fullText: { en: l.fullText.en, id: l.fullText.id },
    sortOrder: l.sortOrder,
    isActive: true,
    createdAt: '2025-01-15T00:00:00.000Z',
    updatedAt: '2025-01-15T00:00:00.000Z',
  }));
}

/* ------------------------------------------------------------------ */
/* Tags                                                                */
/* ------------------------------------------------------------------ */

const TAG_NAME_OVERRIDE: Record<string, string> = {
  'sci-fi': 'Sci-Fi',
  'low-poly': 'Low-Poly',
  'hand-painted': 'Hand-Painted',
  'game-ready': 'Game-Ready',
  'lo-fi': 'Lo-Fi',
  'c++': 'C++',
};

function tagDisplayName(raw: string): string {
  if (TAG_NAME_OVERRIDE[raw]) return TAG_NAME_OVERRIDE[raw];
  return raw
    .split(/[-\s]+/)
    .map((w) => C.TAG_WORDS[w] ?? w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/* ------------------------------------------------------------------ */
/* Assets                                                              */
/* ------------------------------------------------------------------ */

const UNITY_EDITORS = ['2021.3', '2022.3', '6000.0'];
const UNREAL_EDITORS = ['5.3', '5.4', '5.5'];
const BLENDER_EDITORS = ['4.0', '4.1', '4.2', '4.3', '4.4'];
const UNITY_PIPES: RenderPipeline[] = ['URP', 'HDRP', 'BUILT_IN'];
const UNREAL_PIPES: RenderPipeline[] = ['LUMEN', 'NANITE'];
const BLENDER_PIPES: RenderPipeline[] = ['EEVEE', 'CYCLES'];
const OTHER_TARGETS: TargetPlatform[] = ['MAC', 'LINUX', 'ANDROID', 'IOS', 'WEB', 'VR', 'CONSOLE'];

const ENGINE_NAME: Record<string, string> = {
  UNITY: 'Unity',
  UNREAL: 'Unreal Engine',
  BLENDER: 'Blender',
};

interface Work {
  entry: Entry;
  id: string;
  title: string;
  originalTitle?: string;
  status: AssetStatus;
  ownerId: string;
  createdMs: number;
  publishedMs: number | null;
  updatedMs: number;
  versionPlan: { semver: string; publishedMs: number | null; createdMs: number }[];
  forceRecent: boolean;
  infected: boolean;
  inLibrary: boolean;
  downloads: number;
  saves: number;
  views: number;
  versions: AssetVersionRecord[];
}

function pickSubset<T>(rng: Rng, items: readonly T[], min: number, max: number): T[] {
  const n = rng.int(min, Math.min(max, items.length));
  const chosen = new Set(rng.shuffle(items).slice(0, n));
  return items.filter((i) => chosen.has(i));
}

function compatRows(
  rng: Rng,
  engine: Engine,
  category: string,
  k: number,
  n: number,
): CompatibilityRow[] {
  const editors =
    engine === 'UNITY'
      ? UNITY_EDITORS
      : engine === 'UNREAL'
        ? UNREAL_EDITORS
        : engine === 'BLENDER'
          ? BLENDER_EDITORS
          : null;
  if (!editors) return [];
  const count = Math.max(1, editors.length - (n - 1 - k));
  return editors.slice(0, count).map((engineVersion) => {
    if (engine === 'UNITY') {
      const multi = category === 'shaders' || category === 'vfx';
      return {
        engineVersion,
        renderPipelines: pickSubset(rng, UNITY_PIPES, 1, multi ? 3 : 2),
        targets: ['WINDOWS', ...pickSubset(rng, OTHER_TARGETS, 1, 3)] as TargetPlatform[],
      };
    }
    if (engine === 'UNREAL') {
      return {
        engineVersion,
        renderPipelines: pickSubset(rng, UNREAL_PIPES, 1, 2),
        targets: [
          'WINDOWS',
          ...pickSubset(rng, ['MAC', 'LINUX', 'CONSOLE'] as TargetPlatform[], 0, 2),
        ],
      };
    }
    return { engineVersion, renderPipelines: pickSubset(rng, BLENDER_PIPES, 1, 2), targets: [] };
  });
}

function dependencies(rng: Rng, engine: Engine): AssetDependency[] {
  if (engine === 'UNITY' && rng.chance(0.4)) return pickSubset(rng, C.UNITY_DEPS, 1, 2);
  if (engine === 'UNREAL' && rng.chance(0.25)) return pickSubset(rng, C.UNREAL_DEPS, 1, 2);
  if (engine === 'BLENDER' && rng.chance(0.1)) return [...C.BLENDER_DEPS];
  return [];
}

function releaseNotes(rng: Rng, semver: string, index: number): TipTapDoc {
  if (index === 0) return doc(para(C.NOTES_INITIAL[0]), bullets([C.NOTES_INITIAL[1]]));
  const [, minor, patch] = semver.split('.').map(Number);
  if (semver.endsWith('.0.0')) {
    return doc(
      para(`Version ${semver} is a major update.`),
      bullets(rng.shuffle(C.NOTES_MAJOR).slice(0, 3)),
    );
  }
  if (patch > 0 && minor === 0) return doc(para(rng.pick(C.NOTES_PATCH)));
  return doc(
    para(`What is new in ${semver}:`),
    bullets(rng.shuffle(C.NOTES_MINOR).slice(0, rng.int(2, 3))),
  );
}

const SEMVER_PLANS: Record<number, string[][]> = {
  1: [['1.0.0']],
  2: [
    ['1.0.0', '1.1.0'],
    ['1.0.0', '1.0.1'],
    ['1.0.0', '2.0.0'],
  ],
  3: [
    ['1.0.0', '1.1.0', '2.0.0'],
    ['1.0.0', '1.0.1', '1.1.0'],
  ],
};

function buildAssets(
  entries: Entry[],
  users: UserRecord[],
  rng: Rng,
  recentDays: number[],
): { works: Work[] } {
  const cats = C.CATEGORY_SEEDS.map((c) => c.slug);
  const personaRng = rng.fork('persona');
  const statusRng = rng.fork('status');
  const ownerRng = rng.fork('owner');
  const dateRng = rng.fork('dates');
  const verRng = rng.fork('versions');

  /* persona picks: round-robin over shuffled categories */
  const byCat = new Map<string, Entry[]>();
  // BOOTH listings (Japanese titles, avatar-related art) stay out of the persona's
  // assets, which drive the most prominent placements (featured slots, top lists).
  for (const c of cats) {
    byCat.set(
      c,
      personaRng.shuffle(entries.filter((e) => e.category === c && e.store !== 'BOOTH')),
    );
  }
  const catOrder = personaRng.shuffle(cats);
  const personaEntries: Entry[] = [];
  for (let round = 0; personaEntries.length < 18; round++) {
    for (const c of catOrder) {
      const e = byCat.get(c)![round];
      if (e && personaEntries.length < 18) personaEntries.push(e);
    }
  }
  const personaSet = new Set(personaEntries.map((e) => e.slug));
  const personaOrder = personaRng.shuffle(personaEntries);
  const status = new Map<string, AssetStatus>();
  personaOrder.forEach((e, i) =>
    status.set(e.slug, i < 15 ? 'PUBLISHED' : i < 17 ? 'DRAFT' : 'ARCHIVED'),
  );

  /* other drafts / archived, never dropping a category under 10 published */
  const spare = new Map<string, number>();
  for (const c of cats) {
    const total = entries.filter((e) => e.category === c).length;
    const used = personaEntries.filter(
      (e) => e.category === c && status.get(e.slug) !== 'PUBLISHED',
    ).length;
    spare.set(c, total - 10 - used);
  }
  const nonPub: Entry[] = [];
  for (const e of statusRng.shuffle(entries.filter((e) => !personaSet.has(e.slug)))) {
    if (nonPub.length >= 16) break;
    if ((spare.get(e.category) ?? 0) > 0) {
      spare.set(e.category, spare.get(e.category)! - 1);
      nonPub.push(e);
    }
  }
  nonPub.forEach((e, i) => status.set(e.slug, i < 10 ? 'DRAFT' : 'ARCHIVED'));
  for (const e of entries) if (!status.has(e.slug)) status.set(e.slug, 'PUBLISHED');

  /* owners: every admin/contributor owns at least one published asset */
  const owners = users.filter((u) => u.id !== PERSONA_ID && u.role !== 'user');
  const ownerRank = ownerRng.shuffle(owners);
  const others = entries.filter((e) => !personaSet.has(e.slug));
  const pubOthers = ownerRng.shuffle(others.filter((e) => status.get(e.slug) === 'PUBLISHED'));
  const ownerOf = new Map<string, string>();
  pubOthers.forEach((e, i) => {
    ownerOf.set(
      e.slug,
      i < owners.length
        ? owners[i].id
        : ownerRng.weighted(ownerRank, (_u, r) => 1 / Math.pow(r + 1, 0.6)).id,
    );
  });
  for (const e of others) {
    if (!ownerOf.has(e.slug)) {
      ownerOf.set(e.slug, ownerRng.weighted(ownerRank, (_u, r) => 1 / Math.pow(r + 1, 0.6)).id);
    }
  }
  for (const e of personaEntries) ownerOf.set(e.slug, PERSONA_ID);

  const userById = new Map(users.map((u) => [u.id, u]));
  const forceSlug = personaOrder.find((e) => status.get(e.slug) === 'PUBLISHED')!.slug;
  const stateOrder = new Map(entries.map((e, i) => [e.slug, i]));

  // Published assets that go live in the last 30 days (one per distinct day) feed the
  // admin "publishes" chart.
  const recentPick = rng
    .fork('recent')
    .shuffle(entries.filter((e) => status.get(e.slug) === 'PUBLISHED' && e.slug !== forceSlug))
    .slice(0, recentDays.length);
  const recentPublish = new Map(recentPick.map((e, i) => [e.slug, recentDays[i]] as const));
  const recentRng = rng.fork('recent-time');

  const works: Work[] = [];
  for (const entry of entries) {
    const st = status.get(entry.slug)!;
    const ownerId = ownerOf.get(entry.slug)!;
    const ownerCreated = Date.parse(userById.get(ownerId)!.createdAt);
    const force = entry.slug === forceSlug;
    let lo = Math.max(ownerCreated + 2 * DAY, WINDOW_START_MS);
    let hi = ANCHOR_MS - 20 * DAY;
    if (st === 'DRAFT') {
      lo = Math.max(lo, ANCHOR_MS - 120 * DAY);
      hi = ANCHOR_MS - 3 * DAY;
    }
    if (force) {
      lo = ANCHOR_MS - 320 * DAY;
      hi = ANCHOR_MS - 80 * DAY;
    }
    let createdMs = Date.parse(dateRng.date(lo, hi));
    const recentDay = recentPublish.get(entry.slug);
    let recentPublishedMs: number | null = null;
    if (recentDay !== undefined) {
      recentPublishedMs = ANCHOR_MS - recentDay * DAY + recentRng.int(0, 23) * HOUR;
      createdMs = recentPublishedMs - recentRng.int(0, 2) * DAY - recentRng.int(1, 12) * HOUR;
    }
    const w: Work = {
      entry,
      id: `a-${entry.slug}`,
      title: C.ENGLISH_TITLES[entry.slug] ?? entry.title,
      status: st,
      ownerId,
      createdMs,
      publishedMs: null,
      updatedMs: createdMs,
      versionPlan: [],
      forceRecent: force,
      infected: false,
      inLibrary: false,
      downloads: 0,
      saves: 0,
      views: 0,
      versions: [],
    };
    if (C.ENGLISH_TITLES[entry.slug]) w.originalTitle = entry.title;

    if (st === 'DRAFT') {
      w.versionPlan = [{ semver: '1.0.0', publishedMs: null, createdMs }];
      w.updatedMs = Math.min(
        createdMs + dateRng.int(0, 20) * DAY + dateRng.int(0, 20) * HOUR,
        ANCHOR_MS - HOUR,
      );
    } else {
      const published =
        recentPublishedMs ??
        Math.min(
          createdMs + dateRng.int(0, 6) * DAY + dateRng.int(0, 23) * HOUR,
          ANCHOR_MS - 2 * DAY,
        );
      w.publishedMs = published;
      let want = verRng.weighted([1, 2, 3], (n) => (n === 1 ? 45 : n === 2 ? 35 : 20));
      if (force) want = 2;
      const plan = verRng.pick(SEMVER_PLANS[want]);
      let at = published;
      plan.forEach((semver, i) => {
        if (i > 0) {
          at =
            force && i === plan.length - 1
              ? ANCHOR_MS - 8 * DAY - verRng.int(0, 5) * HOUR
              : at + verRng.int(25, 140) * DAY + verRng.int(0, 23) * HOUR;
        }
        if (at > ANCHOR_MS - DAY) return;
        w.versionPlan.push({
          semver,
          publishedMs: at,
          createdMs: i === 0 ? createdMs : Math.max(createdMs, at - verRng.int(1, 3) * DAY),
        });
      });
      const last = w.versionPlan[w.versionPlan.length - 1].publishedMs!;
      const extra =
        st === 'ARCHIVED'
          ? verRng.int(10, 90) * DAY
          : verRng.int(0, 10) * DAY + verRng.int(0, 20) * HOUR;
      w.updatedMs = Math.min(last + (force ? DAY : extra), ANCHOR_MS - HOUR);
    }
    works.push(w);
  }
  works.sort((a, b) => stateOrder.get(a.entry.slug)! - stateOrder.get(b.entry.slug)!);

  /* one infected, non-latest version on a published asset of someone else */
  const candidates = works.filter(
    (w) => w.status === 'PUBLISHED' && w.ownerId !== PERSONA_ID && w.versionPlan.length >= 2,
  );
  verRng.pick(candidates).infected = true;
  return { works };
}

function buildVersions(w: Work, rng: Rng, catSlug: string): AssetVersionRecord[] {
  const n = w.versionPlan.length;
  const deps = dependencies(rng, w.entry.engine);
  const content = `Original asset page:\n${w.entry.url}\n`;
  const bytes = String(Buffer.byteLength(content, 'utf8'));
  return w.versionPlan.map((vp, k) => {
    const dash = vp.semver.replace(/\./g, '-');
    return {
      id: `v-${w.entry.slug}-${dash}`,
      semver: vp.semver,
      // Locale map, as the API and `versions-list.tsx` use it (English only in the seed).
      releaseNotes: { en: releaseNotes(rng, vp.semver, k) },
      publishedAt: vp.publishedMs === null ? null : iso(vp.publishedMs),
      isLatest: k === n - 1,
      analysisStatus: 'READY',
      bytesTotal: bytes,
      fileCount: 1,
      files: [
        {
          id: `f-${w.entry.slug}-${dash}`,
          relativePath: `${w.entry.slug}-${vp.semver}.txt`,
          kind: 'OTHER',
          bytes,
          meta: { content },
        },
      ],
      compatibility: compatRows(rng, w.entry.engine, catSlug, k, n),
      dependencies: deps,
      requiresEmptyProject: catSlug === 'templates',
      createdAt: iso(vp.createdMs),
      avStatus: w.infected && k === 0 ? 'INFECTED' : 'CLEAN',
      avAcknowledgedAt: null,
    };
  });
}

function longDescription(
  rng: Rng,
  w: Work,
  latest: AssetVersionRecord,
  categoryName: string,
  licenseName: string,
  tagNames: string[],
): TipTapDoc {
  const e = w.entry;
  const first = [e.short, rng.pick(C.DESC_EXTRA[e.category])];
  if (w.originalTitle) first.push(`The original store listing is titled "${w.originalTitle}".`);
  const facts = [
    `Category: ${categoryName}`,
    `License: ${licenseName}`,
    `Made for ${C.ENGINE_LABEL[e.engine]}`,
    `Tags: ${tagNames.slice(0, 4).join(', ')}`,
    `Latest version: ${latest.semver} (${w.versionPlan.length} ${w.versionPlan.length === 1 ? 'release' : 'releases'})`,
  ];
  const keep = [facts[0], facts[1], ...rng.shuffle(facts.slice(2)).slice(0, rng.int(2, 3))];
  const ordered = facts.filter((f) => keep.includes(f));
  const rows = latest.compatibility;
  const compat = ENGINE_NAME[e.engine]
    ? rows.length > 0
      ? `Compatibility is listed per version. The latest release is marked for ${ENGINE_NAME[e.engine]} ${rows
          .map((r) => r.engineVersion)
          .join(', ')}.`
      : `Compatibility is listed per version for ${ENGINE_NAME[e.engine]}.`
    : `This is not tied to a single engine, so it can be used with ${C.ENGINE_LABEL[e.engine]}.`;
  const demo = rng.chance(0.5)
    ? ' This is a demo listing: the file attached to each version is a text file that points to the original store page.'
    : '';
  return doc(
    para(first.join(' ')),
    heading(2, 'At a glance'),
    bullets(ordered),
    para(compat + demo),
    para([
      t(`View the original listing on ${e.store}`, [{ type: 'link', attrs: { href: e.url } }]),
      t('.'),
    ]),
  );
}

/* ------------------------------------------------------------------ */
/* Comments                                                            */
/* ------------------------------------------------------------------ */

interface WorkComment {
  seq: number;
  assetId: string;
  parentSeq: number | null;
  authorId: string;
  kind: CommentKind;
  issueStatus: IssueStatus | null;
  /** Tone of a top-level comment (drives which replies fit); null for replies. */
  tone: CP.ReplyTone | null;
  depth: number;
  body: TipTapDoc;
  createdMs: number;
  editedMs: number | null;
  deletedMs: number | null;
}

const TOMBSTONE = doc(para('This comment was deleted.'));

function assetGroup(category: string): 'visual' | 'animation' | 'audio' | 'code' | 'docs' {
  if (category === 'animation') return 'animation';
  if (category === 'audio') return 'audio';
  if (category === 'scripts' || category === 'tools') return 'code';
  if (category === 'documents') return 'docs';
  return 'visual';
}

/* ------------------------------------------------------------------ */
/* Main build                                                          */
/* ------------------------------------------------------------------ */

function build(): SeedData {
  const root = rootRng();
  const entries = loadEntries();

  // Distinct days (1..29 before the anchor) for sign-ups and publishes in the last 30 days.
  const dayPool = root.fork('recent-days').shuffle(Array.from({ length: 27 }, (_, i) => i + 3));
  const userDays = dayPool.slice(0, 7);
  const assetDays = dayPool.slice(7, 20);
  const users = buildUsers(root.fork('users'), userDays);
  const userById = new Map(users.map((u) => [u.id, u]));
  const categories = buildCategories();
  const licenses = buildLicenses();
  const catBySlug = new Map(categories.map((c) => [c.slug, c]));
  const licBySlug = new Map(licenses.map((l) => [l.slug, l]));

  /* ---- tags ---- */
  const tagSlugs = [...new Set(entries.flatMap((e) => e.tags.map(slugify)))].sort(cmp);
  const tagDisplay = new Map<string, string>();
  for (const e of entries)
    for (const raw of e.tags) tagDisplay.set(slugify(raw), tagDisplayName(raw));

  /* ---- assets ---- */
  const { works } = buildAssets(entries, users, root.fork('assets'), assetDays);
  const workById = new Map(works.map((w) => [w.id, w]));

  /* ---- ownership transfers (applied to ownerId; the audit log records them) ---- */
  const trRng = root.fork('transfers');
  const ownedPublished = new Map<string, number>();
  for (const w of works) {
    if (w.status === 'PUBLISHED')
      ownedPublished.set(w.ownerId, (ownedPublished.get(w.ownerId) ?? 0) + 1);
  }
  const transfers: { assetId: string; from: string; to: string }[] = [];
  for (const w of trRng.shuffle(
    works.filter((x) => x.status === 'PUBLISHED' && x.ownerId !== PERSONA_ID),
  )) {
    if (transfers.length >= 4) break;
    if ((ownedPublished.get(w.ownerId) ?? 0) < 2) continue;
    const to = trRng.pick(
      users.filter((u) => u.role !== 'user' && u.id !== PERSONA_ID && u.id !== w.ownerId),
    ).id;
    transfers.push({ assetId: w.id, from: w.ownerId, to });
    ownedPublished.set(w.ownerId, ownedPublished.get(w.ownerId)! - 1);
    ownedPublished.set(to, (ownedPublished.get(to) ?? 0) + 1);
    w.ownerId = to;
  }
  const verRng = root.fork('version-content');
  for (const w of works) w.versions = buildVersions(w, verRng.fork(w.id), w.entry.category);

  /* ---- library (persona) ---- */
  const libRng = root.fork('library');
  const eligible = works.filter(
    (w) => w.status === 'PUBLISHED' && w.publishedMs! <= ANCHOR_MS - 10 * DAY,
  );
  const otherEligible = libRng.shuffle(eligible.filter((w) => w.ownerId !== PERSONA_ID));
  const ownEligible = libRng.shuffle(eligible.filter((w) => w.ownerId === PERSONA_ID));
  const libWorks = [...otherEligible.slice(0, 40), ...ownEligible.slice(0, 2)];
  const hiddenIds = new Set(
    libRng
      .shuffle(libWorks)
      .slice(0, 3)
      .map((w) => w.id),
  );
  const library: LibraryRecord[] = libWorks
    .map((w) => {
      w.inLibrary = true;
      const lo = Math.max(w.publishedMs! + DAY, ANCHOR_MS - 183 * DAY);
      return {
        id: w.id,
        addedAt: libRng.date(lo, ANCHOR_MS - DAY),
        hidden: hiddenIds.has(w.id),
      };
    })
    .sort((a, b) => cmp(b.addedAt, a.addedAt) || cmp(a.id, b.id));

  /* ---- metrics ---- */
  const metRng = root.fork('metrics');
  for (const w of works) {
    if (w.status === 'DRAFT') continue;
    const isPersona = w.ownerId === PERSONA_ID;
    const age = (ANCHOR_MS - w.publishedMs!) / DAY;
    const pop = Math.pow(metRng.next(), 4);
    let base = 25 + pop * 9000 * (0.3 + 0.7 * Math.min(1, age / 330)) * Math.min(1, age / 45);
    if (isPersona) base = base * 1.5 + 300 + metRng.int(0, 600);
    w.downloads = Math.round(base);
    const rate = isPersona ? 0.1 + 0.12 * metRng.next() : 0.04 + 0.12 * metRng.next();
    w.saves = Math.round(w.downloads * rate) + (w.inLibrary ? 1 : 0);
    w.views = w.downloads * metRng.int(4, 9) + metRng.int(40, 400);
  }

  /* ---- asset records ---- */
  const descRng = root.fork('descriptions');
  const tagUsage = new Map<string, number>();
  const tagFirst = new Map<string, number>();
  const assets: AssetRecord[] = works.map((w) => {
    const e = w.entry;
    const cat = catBySlug.get(e.category)!;
    const lic = licBySlug.get(e.license)!;
    const tagIds = [...new Set(e.tags.map(slugify))].map((s) => `tag-${s}`);
    for (const id of tagIds) {
      tagUsage.set(id, (tagUsage.get(id) ?? 0) + 1);
      tagFirst.set(id, Math.min(tagFirst.get(id) ?? Infinity, w.createdMs));
    }
    const latest = w.versions[w.versions.length - 1];
    const record: AssetRecord = {
      id: w.id,
      slug: e.slug,
      title: w.title,
      shortDescription: e.short,
      longDescription: longDescription(
        descRng.fork(w.id),
        w,
        latest,
        cat.name.en,
        lic.name,
        tagIds.map((id) => tagDisplay.get(id.slice(4))!),
      ),
      availableLocales: ['en', 'id'],
      engine: e.engine,
      ownerId: w.ownerId,
      categoryId: cat.id,
      licenseId: lic.id,
      tagIds,
      titleI18n: { en: w.title, id: w.title },
      shortDescriptionI18n: { en: e.short, id: e.short_id },
      storeName: e.store,
      storeUrl: e.url,
      thumbnail: { key: `thumbs/${e.slug}.webp`, url: `/thumbs/${e.slug}.webp` },
      thumbnailSmall: `/thumbs/${e.slug}-sm.webp`,
      thumbnailAutoGenerated: null,
      previewMedia: [
        {
          id: `pm-${e.slug}-1`,
          kind: 'image',
          key: `thumbs/${e.slug}.webp`,
          label: 'Cover',
          viewUrl: `/thumbs/${e.slug}.webp`,
          originalUrl: `/thumbs/${e.slug}.webp`,
          mime: 'image/webp',
          visibility: 'visible',
        },
      ],
      versions: w.versions,
      totalDownloads: w.downloads,
      totalSaves: w.saves,
      viewCount: w.views,
      status: w.status,
      publishedAt: w.publishedMs === null ? null : iso(w.publishedMs),
      updatedAt: iso(w.updatedMs),
      createdAt: iso(w.createdMs),
    };
    if (w.originalTitle) record.originalTitle = w.originalTitle;
    return record;
  });
  assets.sort((a, b) => cmp(a.id, b.id));
  const assetById = new Map(assets.map((a) => [a.id, a]));

  const tags: TagRecord[] = tagSlugs.map((s) => ({
    id: `tag-${s}`,
    slug: s,
    displayName: tagDisplay.get(s)!,
    usageCount: tagUsage.get(`tag-${s}`) ?? 0,
    createdAt: iso(tagFirst.get(`tag-${s}`) ?? ANCHOR_MS),
  }));

  const published = works.filter((w) => w.status === 'PUBLISHED');
  const pubOf = (id: string): Work => workById.get(id)!;
  const userName = (id: string): string => userById.get(id)!.displayName;
  const admins = users.filter((u) => u.isAdmin);

  /* ================================================================== */
  /* Comments                                                            */
  /* ================================================================== */
  const cRng = root.fork('comments');
  const work: WorkComment[] = [];
  const byAsset = new Map<string, WorkComment[]>();
  const TARGET = 318;
  const userWeight = (u: UserRecord): number =>
    u.id === PERSONA_ID ? 7 : u.role === 'user' ? 2 : 3;
  const engineBound = (w: Work): boolean => Boolean(ENGINE_NAME[w.entry.engine]);

  /** Latest version of the asset that already existed at `ms` (first one as a fallback). */
  const versionAt = (w: Work, ms: number): string => {
    let v = w.versionPlan[0];
    for (const p of w.versionPlan) if (p.publishedMs !== null && p.publishedMs <= ms) v = p;
    return v.semver;
  };
  /** First version published after `ms`, if any (so "fixed in X" is true). */
  const nextAfter = (w: Work, ms: number): string => {
    const p = w.versionPlan.find((x) => x.publishedMs !== null && x.publishedMs > ms);
    return p ? p.semver : '';
  };
  const varsFor = (w: Work, ms: number): Record<string, string> => {
    const rows = w.versions[w.versions.length - 1].compatibility;
    return {
      title: w.title,
      engine: ENGINE_NAME[w.entry.engine] ?? '',
      ver: rows.length ? rows[rows.length - 1].engineVersion : '',
      semver: versionAt(w, ms),
      next: nextAfter(w, ms),
    };
  };
  const usable = (tpl: string, vars: Record<string, string>): boolean =>
    [...tpl.matchAll(/\{(\w+)\}/g)].every((m) => Boolean(vars[m[1]]));

  /** Body bookkeeping: no body twice in one asset, none more than 3 times overall. */
  const bodyUses = new Map<string, number>();
  const assetBodies = new Map<string, Set<string>>();
  const reserve = (assetId: string, key: string): void => {
    bodyUses.set(key, (bodyUses.get(key) ?? 0) + 1);
    const set = assetBodies.get(assetId) ?? new Set<string>();
    set.add(key);
    assetBodies.set(assetId, set);
  };
  const free = (assetId: string, key: string, cap: number): boolean =>
    !(assetBodies.get(assetId)?.has(key) ?? false) && (bodyUses.get(key) ?? 0) < cap;

  const pickText = (
    w: Work,
    vars: Record<string, string>,
    pools: string[][],
    closer: boolean,
    preferred: string[] = [],
  ): string => {
    const cands = cRng.shuffle(pools.flat()).filter((tpl) => usable(tpl, vars));
    const tail = closer && cRng.chance(0.3) ? ` ${cRng.pick(CP.CLOSERS)}` : '';
    // topic-specific answers first (kept unique), then the neutral pool
    for (const cap of [1, 2]) {
      for (const tpl of cRng.shuffle(preferred).filter((x) => usable(x, vars))) {
        const text = fill(tpl, vars) + tail;
        if (free(w.id, text, cap)) {
          reserve(w.id, text);
          return text;
        }
      }
    }
    for (const cap of [1, 2, 3]) {
      for (const tpl of cands) {
        const text = fill(tpl, vars) + tail;
        if (free(w.id, text, cap)) {
          reserve(w.id, text);
          return text;
        }
      }
    }
    const text = `${fill(cands[0], vars)} (${w.title})`;
    reserve(w.id, text);
    return text;
  };

  const issueBody = (w: Work, ms: number): TipTapDoc => {
    const vars = varsFor(w, ms);
    const pool = cRng
      .shuffle(CP.ISSUES[assetGroup(w.entry.category)])
      .filter((tpl) => usable(tpl.title, vars) && usable(tpl.detail, vars));
    let chosen = pool[0];
    search: for (const cap of [1, 2, 3]) {
      for (const tpl of pool) {
        if (free(w.id, `issue:${tpl.title}`, cap)) {
          chosen = tpl;
          break search;
        }
      }
    }
    reserve(w.id, `issue:${chosen.title}`);
    return {
      type: 'doc',
      content: [
        para([t(chosen.title, [{ type: 'bold' }])]),
        para(fill(chosen.detail, vars)),
        para('Steps to reproduce:'),
        bullets(chosen.steps),
      ],
    };
  };

  const topText = (w: Work, author: UserRecord, tone: CP.TopTone, ms: number): string => {
    const vars = varsFor(w, ms);
    const pools =
      author.locale === 'id' && cRng.chance(0.4)
        ? [CP.TOP_ID[tone]]
        : engineBound(w)
          ? [CP.TOP[tone], CP.TOP_ENGINE[tone]]
          : [CP.TOP[tone]];
    return pickText(w, vars, pools, tone === 'praise' && author.locale !== 'id');
  };

  const plainText = (d: TipTapDoc): string =>
    (d.content ?? []).flatMap((n) => (n.content ?? []).map((x) => x.text ?? '')).join(' ');

  const rootOf = (c: WorkComment): WorkComment => {
    let cur = c;
    while (cur.parentSeq !== null) cur = work[cur.parentSeq];
    return cur;
  };

  const replyText = (w: Work, author: UserRecord, parent: WorkComment, ms: number): string => {
    const vars = varsFor(w, ms);
    const isOwner = author.id === w.ownerId;
    const id = author.locale === 'id' && cRng.chance(0.3);
    if (parent.depth === 0 && parent.tone) {
      const pool = CP.REPLY[parent.tone];
      if (parent.tone === 'question' && !id) {
        const topic = CP.questionTopic(plainText(parent.body));
        const answers = topic ? CP.QUESTION_ANSWERS[topic] : null;
        if (answers) {
          return pickText(
            w,
            vars,
            [isOwner ? pool.owner : pool.user],
            false,
            isOwner ? answers.owner : answers.user,
          );
        }
      }
      if (parent.tone === 'suggestion' && isOwner && CP.VIDEO_RE.test(plainText(parent.body))) {
        return pickText(w, vars, [pool.owner], false, CP.SUGGESTION_VIDEO_OWNER);
      }
      if (isOwner) {
        if (parent.tone === 'bug' && vars.next && cRng.chance(0.8)) {
          return pickText(w, vars, [CP.REPLY_FIXED], false);
        }
        return pickText(w, vars, [id ? pool.ownerId : pool.owner], false);
      }
      return pickText(w, vars, [id ? pool.userId : pool.user], false);
    }
    if (id) return pickText(w, vars, [CP.FOLLOW.id], false);
    const op = author.id === rootOf(parent).authorId;
    return pickText(
      w,
      vars,
      [op ? CP.FOLLOW.op : isOwner ? CP.FOLLOW.owner : CP.FOLLOW.other],
      false,
    );
  };

  const signedUp = (u: UserRecord, ms: number): boolean => Date.parse(u.createdAt) <= ms;
  const pickAuthor = (ms: number, excl: Set<string>): string =>
    cRng.weighted(
      users.filter((u) => !excl.has(u.id) && signedUp(u, ms)),
      userWeight,
    ).id;
  const replyAuthor = (
    w: Work,
    parent: WorkComment,
    ms: number,
    prefer: 'owner' | 'op' | 'any',
  ): string => {
    const ok = (uid: string): boolean =>
      uid !== parent.authorId && signedUp(userById.get(uid)!, ms);
    if (prefer === 'owner' && ok(w.ownerId)) return w.ownerId;
    const op = rootOf(parent).authorId;
    if (prefer === 'op' && ok(op)) return op;
    return pickAuthor(ms, new Set([parent.authorId]));
  };

  const recencyDate = (lo: number, hi: number): number => {
    const u = cRng.next();
    return Math.floor(lo + (hi - lo) * (1 - Math.pow(1 - u, 1.3)));
  };
  /** A reply lands 20 minutes to 4 days after its parent, never after the anchor. */
  const replyTime = (parentMs: number): number => {
    const room = Math.floor((ANCHOR_MS - HOUR - parentMs) / MIN);
    return parentMs + cRng.int(20, Math.max(20, Math.min(60 * 24 * 4, room))) * MIN;
  };
  const assetWeights = published.map(
    (w) => (1 + Math.min(6, w.downloads / 600)) * (w.ownerId === PERSONA_ID ? 1.4 : 1),
  );

  const addComment = (c: Omit<WorkComment, 'seq'>): WorkComment => {
    const full: WorkComment = { seq: work.length, ...c };
    work.push(full);
    const list = byAsset.get(c.assetId) ?? [];
    list.push(full);
    byAsset.set(c.assetId, list);
    return full;
  };

  const addReply = (w: Work, parent: WorkComment, prefer: 'owner' | 'op' | 'any'): WorkComment => {
    const createdMs = replyTime(parent.createdMs);
    const authorId = replyAuthor(w, parent, createdMs, prefer);
    return addComment({
      assetId: w.id,
      parentSeq: parent.seq,
      authorId,
      kind: 'COMMENT',
      issueStatus: null,
      tone: null,
      depth: parent.depth + 1,
      body: doc(para(replyText(w, userById.get(authorId)!, parent, createdMs))),
      createdMs,
      editedMs: null,
      deletedMs: null,
    });
  };

  while (work.length < TARGET) {
    const w = cRng.weighted(published, (_x, i) => assetWeights[i]);
    const list = byAsset.get(w.id) ?? [];
    const pubMs = w.publishedMs!;
    if (list.length === 0 || cRng.chance(0.45)) {
      const isIssue = cRng.chance(0.18);
      const lo = pubMs + DAY;
      const hi = ANCHOR_MS - 2 * HOUR;
      const recent = w.ownerId === PERSONA_ID && cRng.chance(0.3);
      const createdMs = recent
        ? cRng.int(Math.max(lo, ANCHOR_MS - 28 * DAY), hi)
        : recencyDate(lo, hi);
      const authorId = pickAuthor(createdMs, new Set(cRng.chance(0.9) ? [w.ownerId] : []));
      const author = userById.get(authorId)!;
      const tone: CP.TopTone = cRng.weighted(
        ['question', 'praise', 'suggestion'] as CP.TopTone[],
        (x) => (x === 'question' ? 32 : x === 'praise' ? 38 : 30),
      );
      addComment({
        assetId: w.id,
        parentSeq: null,
        authorId,
        kind: isIssue ? 'ISSUE' : 'COMMENT',
        issueStatus: isIssue ? cRng.weighted(C.ISSUE_STATUS_WEIGHTS, (x) => x[1])[0] : null,
        tone: isIssue ? 'bug' : tone,
        depth: 0,
        body: isIssue ? issueBody(w, createdMs) : doc(para(topText(w, author, tone, createdMs))),
        createdMs,
        editedMs: null,
        deletedMs: null,
      });
    } else {
      const parents = list.filter((c) => c.depth < 4);
      if (parents.length === 0) continue;
      const parent = cRng.weighted(
        parents,
        (c) => 1 + c.depth * c.depth * 1.2 + c.depth * 1.4 + (c.kind === 'ISSUE' ? 1.5 : 0),
      );
      const r = cRng.next();
      const prefer =
        parent.depth >= 1
          ? r < 0.4
            ? 'op'
            : r < 0.7
              ? 'owner'
              : 'any'
          : r < 0.4
            ? 'owner'
            : 'any';
      addReply(w, parent, prefer);
    }
  }

  /* persona authors two issues on other people's assets */
  const personaIssues = work.filter(
    (c) =>
      c.kind === 'ISSUE' &&
      c.authorId !== PERSONA_ID &&
      pubOf(c.assetId).ownerId !== PERSONA_ID &&
      !work.some((r) => r.parentSeq === c.seq && r.authorId === PERSONA_ID),
  );
  const usedAssets = new Set<string>();
  let converted = 0;
  for (const c of personaIssues) {
    if (converted >= 2) break;
    if (usedAssets.has(c.assetId)) continue;
    usedAssets.add(c.assetId);
    c.authorId = PERSONA_ID;
    c.issueStatus = converted === 0 ? 'ACKNOWLEDGED' : 'RESOLVED';
    converted++;
  }

  /* make sure persona comments received replies */
  const personaComments = work.filter((c) => c.authorId === PERSONA_ID && c.depth < 4);
  let added = 0;
  for (const c of personaComments) {
    if (added >= 12) break;
    if (work.some((r) => r.parentSeq === c.seq)) continue;
    addReply(pubOf(c.assetId), c, added % 2 === 0 ? 'owner' : 'any');
    added++;
  }

  /* a few threads that reach the maximum depth (5 levels) */
  let deepAdded = 0;
  for (const c of cRng.shuffle(work.filter((x) => x.depth === 3))) {
    if (deepAdded >= 4) break;
    if (work.some((r) => r.parentSeq === c.seq)) continue;
    addReply(pubOf(c.assetId), c, deepAdded % 2 === 0 ? 'owner' : 'op');
    deepAdded++;
  }

  /* soft-deleted comments that still have replies */
  const deletable = work.filter(
    (c) =>
      c.depth <= 1 &&
      c.kind === 'COMMENT' &&
      c.authorId !== PERSONA_ID &&
      work.some((r) => r.parentSeq === c.seq),
  );
  const deletedAssets = new Set<string>();
  let deletedCount = 0;
  for (const c of cRng.shuffle(deletable)) {
    if (deletedCount >= 3) break;
    if (deletedAssets.has(c.assetId)) continue;
    deletedAssets.add(c.assetId);
    c.body = TOMBSTONE;
    c.deletedMs = Math.min(c.createdMs + cRng.int(1, 72) * HOUR, ANCHOR_MS - 30 * MIN);
    deletedCount++;
  }
  /* edits */
  for (const c of work) {
    if (c.deletedMs === null && cRng.chance(0.08)) {
      c.editedMs = Math.min(c.createdMs + cRng.int(5, 240) * MIN, ANCHOR_MS - 10 * MIN);
    }
  }

  const ordered = [...work].sort(
    (a, b) => a.createdMs - b.createdMs || a.depth - b.depth || a.seq - b.seq,
  );
  const idOfSeq = new Map(ordered.map((c, i) => [c.seq, `c-${pad(i + 1, 4)}`]));
  const comments: CommentRecord[] = ordered.map((c) => ({
    id: idOfSeq.get(c.seq)!,
    assetId: c.assetId,
    parentId: c.parentSeq === null ? null : idOfSeq.get(c.parentSeq)!,
    authorId: c.authorId,
    kind: c.kind,
    issueStatus: c.issueStatus,
    depth: c.depth,
    body: c.body,
    createdAt: iso(c.createdMs),
    editedAt: c.editedMs === null ? null : iso(c.editedMs),
    deletedAt: c.deletedMs === null ? null : iso(c.deletedMs),
  }));
  const commentById = new Map(comments.map((c) => [c.id, c]));

  /* ================================================================== */
  /* Requests                                                            */
  /* ================================================================== */
  const rqRng = root.fork('requests');
  const listings = rqRng.shuffle(C.REQUEST_LISTINGS);
  const nonPersona = users.filter((u) => u.id !== PERSONA_ID);
  const adminIds = admins.map((a) => a.id);
  const reqPlan: { status: AssetRequestStatus; persona: boolean }[] = [
    { status: 'PENDING', persona: true },
    { status: 'APPROVED', persona: true },
    { status: 'SENT', persona: false },
    { status: 'SENT', persona: false },
    { status: 'IN_REVIEW', persona: false },
    { status: 'IN_REVIEW', persona: false },
    { status: 'PENDING', persona: false },
    { status: 'PENDING', persona: false },
    { status: 'APPROVED', persona: false },
    { status: 'APPROVED', persona: false },
    { status: 'REJECTED', persona: false },
    { status: 'REJECTED', persona: false },
  ];
  const reqRaw = reqPlan.map((p, i) => {
    const l = listings[i];
    const personaPending = p.persona && p.status === 'PENDING';
    const personaApproved = p.persona && p.status === 'APPROVED';
    const createdMs = personaPending
      ? ANCHOR_MS - 6 * DAY
      : personaApproved
        ? ANCHOR_MS - 31 * DAY
        : rqRng.int(ANCHOR_MS - 90 * DAY, ANCHOR_MS - 2 * DAY);
    const reviewed = p.status !== 'SENT';
    const updatedMs = reviewed
      ? Math.min(createdMs + rqRng.int(1, 10) * DAY + rqRng.int(0, 20) * HOUR, ANCHOR_MS - HOUR)
      : createdMs;
    const comment =
      p.status === 'APPROVED'
        ? rqRng.pick(C.REQUEST_ADMIN_APPROVED)
        : p.status === 'REJECTED'
          ? rqRng.pick(C.REQUEST_ADMIN_REJECTED)
          : p.status === 'SENT'
            ? null
            : rqRng.chance(0.6)
              ? rqRng.pick(C.REQUEST_ADMIN_OTHER)
              : null;
    const requesterId = p.persona
      ? PERSONA_ID
      : rqRng.pick(nonPersona.filter((u) => Date.parse(u.createdAt) <= createdMs)).id;
    return {
      status: p.status,
      requesterId,
      createdMs,
      updatedMs,
      listing: l,
      adminComment: comment,
      // an admin never reviews their own request
      reviewedById: reviewed ? rqRng.pick(adminIds.filter((id) => id !== requesterId)) : null,
      intendedUse: rqRng.pick(C.REQUEST_USES),
      price: rqRng.pick([null, null, 0, 5, 9, 15, 19, 29]),
      notes: rqRng.chance(0.5) ? rqRng.pick(C.REQUEST_NOTES) : null,
    };
  });
  reqRaw.sort((a, b) => a.createdMs - b.createdMs);
  const requests: RequestRecord[] = reqRaw.map((r, i) => ({
    id: `req-${pad(i + 1, 2)}`,
    assetLink: r.listing.link,
    assetType: r.listing.type,
    intendedUse: r.intendedUse,
    price: r.price,
    notes: r.notes,
    status: r.status,
    adminComment: r.adminComment,
    createdAt: iso(r.createdMs),
    updatedAt: iso(r.updatedMs),
    requesterId: r.requesterId,
    reviewedById: r.reviewedById,
  }));

  /* ================================================================== */
  /* Reports                                                             */
  /* ================================================================== */
  const rpRng = root.fork('reports');
  const archivedOthers = works.filter((w) => w.status === 'ARCHIVED' && w.ownerId !== PERSONA_ID);
  const pubOthers = rpRng.shuffle(published.filter((w) => w.ownerId !== PERSONA_ID));
  const personaPub = rpRng.shuffle(published.filter((w) => w.ownerId === PERSONA_ID));
  const reportPlan: { status: ReportStatus; action: ReportAction | null; asset: Work }[] = [
    { status: 'OPEN', action: null, asset: personaPub[0] },
    { status: 'OPEN', action: null, asset: pubOthers[0] },
    { status: 'OPEN', action: null, asset: pubOthers[1] },
    { status: 'REVIEWING', action: null, asset: pubOthers[2] },
    { status: 'REVIEWING', action: null, asset: personaPub[1] },
    { status: 'ACTIONED', action: 'ARCHIVE_ASSET', asset: archivedOthers[0] },
    { status: 'ACTIONED', action: 'ARCHIVE_ASSET', asset: archivedOthers[1] },
    { status: 'ACTIONED', action: 'NOTHING', asset: pubOthers[3] },
    { status: 'DISMISSED', action: null, asset: pubOthers[4] },
    { status: 'DISMISSED', action: null, asset: pubOthers[5] },
  ];
  const reportRaw = reportPlan.map((p) => {
    const category: ReportCategory = rpRng.chance(0.3) ? 'MALICIOUS_FILE' : 'BROKEN_ASSET';
    const createdMs = rpRng.int(
      Math.max(ANCHOR_MS - 60 * DAY, (p.asset.publishedMs ?? 0) + DAY),
      ANCHOR_MS - 2 * HOUR,
    );
    const done = p.status === 'ACTIONED' || p.status === 'DISMISSED';
    const touched = p.status !== 'OPEN';
    return {
      ...p,
      category,
      createdMs,
      notes: rpRng.pick(C.REPORT_NOTES[category]),
      reporterId: rpRng.pick(
        nonPersona.filter((u) => u.id !== p.asset.ownerId && Date.parse(u.createdAt) <= createdMs),
      ).id,
      adminNotes: touched ? rpRng.pick(C.REPORT_ADMIN_NOTES) : null,
      resolvedMs: done ? Math.min(createdMs + rpRng.int(1, 7) * DAY, ANCHOR_MS - HOUR) : null,
      resolvedById: done ? rpRng.pick(adminIds) : null,
    };
  });
  reportRaw.sort((a, b) => a.createdMs - b.createdMs || cmp(a.asset.id, b.asset.id));
  const reports: ReportRecord[] = reportRaw.map((r, i) => ({
    id: `rep-${pad(i + 1, 2)}`,
    category: r.category,
    notes: r.notes,
    status: r.status,
    assetId: r.asset.id,
    reporterId: r.reporterId,
    adminNotes: r.adminNotes,
    action: r.action,
    resolvedById: r.resolvedById,
    createdAt: iso(r.createdMs),
    resolvedAt: r.resolvedMs === null ? null : iso(r.resolvedMs),
  }));

  /* ================================================================== */
  /* Featured, devices                                                   */
  /* ================================================================== */
  const fRng = root.fork('featured');
  const topPersona = [...published]
    .filter((w) => w.ownerId === PERSONA_ID && w.publishedMs! <= ANCHOR_MS - 30 * DAY)
    .sort((a, b) => b.downloads - a.downloads || cmp(a.id, b.id))[0];
  const picked = new Map<string, Work>();
  for (const w of [...published]
    .filter(
      (x) =>
        x.ownerId !== PERSONA_ID &&
        x.entry.store !== 'BOOTH' &&
        x.publishedMs! <= ANCHOR_MS - 30 * DAY,
    )
    .sort((a, b) => b.downloads - a.downloads || cmp(a.id, b.id))) {
    if (picked.size >= 4) break;
    if (!picked.has(w.entry.category)) picked.set(w.entry.category, w);
  }
  const featuredWorks = fRng.shuffle([topPersona, ...picked.values()]);
  const featured: FeaturedRecord[] = featuredWorks.map((w, i) => {
    const createdMs = ANCHOR_MS - (28 - i * 5) * DAY + fRng.int(0, 10) * HOUR;
    const custom = i === 1 || i === 3;
    return {
      id: `fs-${i + 1}`,
      assetId: w.id,
      customBannerKey: `featured/${w.entry.slug}.webp`,
      customBannerUrl: `/thumbs/${w.entry.slug}.webp`,
      customTitle: custom ? `Staff pick: ${w.title}` : null,
      // Every slot carries a description in both languages (the admin edit modal's custom-banner
      // mode requires both, so a seeded slot has to be savable as it is). Derived from the asset's
      // own short description; slot 4 keeps its "hand-picked" suffix.
      customShortDescription:
        i === 3
          ? {
              en: `${w.entry.short} Hand-picked by the team this month.`,
              id: `${w.entry.short_id} Dipilih langsung oleh tim bulan ini.`,
            }
          : { en: w.entry.short, id: w.entry.short_id },
      sortOrder: i + 1,
      isActive: true,
      createdAt: iso(createdMs),
      updatedAt: iso(createdMs),
    };
  });
  const revokedMs = ANCHOR_MS - 12 * DAY - 3 * HOUR;
  const devices: DeviceRecord[] = [
    {
      id: 'dev-1',
      userId: PERSONA_ID,
      deviceLabel: "Aria's Workstation - Unity 2022.3",
      createdAt: iso(ANCHOR_MS - 74 * DAY),
      lastUsedAt: iso(ANCHOR_MS - 2 * DAY - 5 * HOUR),
      expiresAt: iso(ANCHOR_MS + 106 * DAY),
      revokedAt: null,
    },
    {
      id: 'dev-2',
      userId: PERSONA_ID,
      deviceLabel: 'Studio Laptop - Unreal Engine 5.4',
      createdAt: iso(ANCHOR_MS - 141 * DAY),
      lastUsedAt: iso(ANCHOR_MS - 19 * DAY),
      expiresAt: iso(ANCHOR_MS + 39 * DAY),
      revokedAt: iso(revokedMs),
    },
  ];

  /* ================================================================== */
  /* Notifications (persona)                                             */
  /* ================================================================== */
  const nRng = root.fork('notifications');
  const personaAssetIds = new Set(works.filter((w) => w.ownerId === PERSONA_ID).map((w) => w.id));
  const desc = <T>(xs: T[], key: (x: T) => string): T[] =>
    [...xs].sort((a, b) => cmp(key(b), key(a)));
  const assetPayload = (id: string): Record<string, unknown> => {
    const a = assetById.get(id)!;
    return { assetId: a.id, assetSlug: a.slug, assetTitle: a.title };
  };
  interface NRaw {
    type: NotificationType;
    createdMs: number;
    payload: Record<string, unknown>;
    old?: boolean;
  }
  const raws: NRaw[] = [];
  const take = <T>(xs: T[], n: number): T[] => xs.slice(0, n);
  for (const c of take(
    desc(
      comments.filter(
        (c) =>
          personaAssetIds.has(c.assetId) &&
          c.depth === 0 &&
          c.kind === 'COMMENT' &&
          c.authorId !== PERSONA_ID &&
          !c.deletedAt,
      ),
      (c) => c.createdAt,
    ),
    3,
  )) {
    raws.push({
      type: 'COMMENT_CREATED',
      createdMs: Date.parse(c.createdAt) + 2 * MIN,
      payload: {
        ...assetPayload(c.assetId),
        commentId: c.id,
        authorDisplayName: userName(c.authorId),
      },
    });
  }
  for (const c of take(
    desc(
      comments.filter(
        (c) =>
          c.parentId !== null &&
          commentById.get(c.parentId)!.authorId === PERSONA_ID &&
          c.authorId !== PERSONA_ID,
      ),
      (c) => c.createdAt,
    ),
    2,
  )) {
    raws.push({
      type: 'COMMENT_REPLY',
      createdMs: Date.parse(c.createdAt) + MIN,
      payload: {
        ...assetPayload(c.assetId),
        commentId: c.id,
        authorDisplayName: userName(c.authorId),
      },
    });
  }
  for (const c of take(
    desc(
      comments.filter(
        (c) => c.kind === 'ISSUE' && personaAssetIds.has(c.assetId) && c.authorId !== PERSONA_ID,
      ),
      (c) => c.createdAt,
    ),
    1,
  )) {
    raws.push({
      type: 'ISSUE_CREATED',
      createdMs: Date.parse(c.createdAt) + 3 * MIN,
      payload: {
        ...assetPayload(c.assetId),
        commentId: c.id,
        authorDisplayName: userName(c.authorId),
      },
    });
  }
  for (const c of take(
    desc(
      comments.filter((c) => c.kind === 'ISSUE' && c.authorId === PERSONA_ID),
      (c) => c.createdAt,
    ),
    1,
  )) {
    raws.push({
      type: 'ISSUE_STATUS_CHANGED',
      createdMs: Math.min(Date.parse(c.createdAt) + 2 * DAY, ANCHOR_MS - 3 * HOUR),
      payload: {
        ...assetPayload(c.assetId),
        commentId: c.id,
        status: c.issueStatus,
        ownerName: userName(assetById.get(c.assetId)!.ownerId),
      },
    });
  }
  const mine = requests.filter((r) => r.requesterId === PERSONA_ID);
  const approved = mine.find((r) => r.status === 'APPROVED')!;
  raws.push({
    type: 'REQUEST_STATUS_CHANGED',
    createdMs: Date.parse(approved.updatedAt),
    payload: {
      requestId: approved.id,
      status: 'APPROVED',
      byAdminName: userName(approved.reviewedById!),
    },
  });
  raws.push({
    type: 'REQUEST_STATUS_CHANGED',
    createdMs: Date.parse(approved.createdAt) + 6 * HOUR,
    payload: {
      requestId: approved.id,
      status: 'IN_REVIEW',
      byAdminName: userName(approved.reviewedById!),
    },
  });
  const sentOthers = desc(
    requests.filter((r) => r.requesterId !== PERSONA_ID && r.status === 'SENT'),
    (r) => r.createdAt,
  )[0];
  raws.push({
    type: 'REQUEST_CREATED',
    createdMs: Date.parse(sentOthers.createdAt) + MIN,
    payload: { requestId: sentOthers.id, requesterName: userName(sentOthers.requesterId) },
  });
  const openReport = desc(
    reports.filter((r) => r.status === 'OPEN' && !personaAssetIds.has(r.assetId)),
    (r) => r.createdAt,
  )[0];
  raws.push({
    type: 'REPORT_CREATED',
    createdMs: Date.parse(openReport.createdAt) + MIN,
    payload: {
      ...assetPayload(openReport.assetId),
      reportId: openReport.id,
      category: openReport.category,
    },
  });
  const personaReport = reports.find((r) => personaAssetIds.has(r.assetId))!;
  raws.push({
    type: 'REPORT_RECEIVED_FOR_YOUR_ASSET',
    createdMs: Date.parse(personaReport.createdAt) + 5 * MIN,
    payload: {
      ...assetPayload(personaReport.assetId),
      reportId: personaReport.id,
      category: personaReport.category,
    },
  });
  const personaFeatured = featured.find((f) => personaAssetIds.has(f.assetId))!;
  raws.push({
    type: 'FEATURED_FEATURED',
    createdMs: Date.parse(personaFeatured.createdAt),
    payload: { ...assetPayload(personaFeatured.assetId), featuredId: personaFeatured.id },
  });
  const forced = works.find((w) => w.forceRecent)!;
  const forcedLatest = forced.versions[forced.versions.length - 1];
  raws.push({
    type: 'VERSION_PUBLISHED',
    createdMs: Date.parse(forcedLatest.publishedAt!) + 4 * MIN,
    payload: {
      ...assetPayload(forced.id),
      versionId: forcedLatest.id,
      semver: forcedLatest.semver,
      versionLabel: `v${forcedLatest.semver}`,
    },
  });
  const personaDrafts = works.filter((w) => w.ownerId === PERSONA_ID && w.status === 'DRAFT');
  const failedDraft = personaDrafts[0];
  raws.push({
    type: 'ANALYZER_FAILED',
    createdMs: Math.min(failedDraft.createdMs + DAY, ANCHOR_MS - DAY),
    payload: {
      ...assetPayload(failedDraft.id),
      versionId: failedDraft.versions[0].id,
      semver: '1.0.0',
      versionLabel: 'v1.0.0',
    },
    old: true,
  });
  raws.push({
    type: 'ADMIN_DEMOTED',
    createdMs: Date.parse('2025-06-16T09:30:00Z'),
    payload: { byAdminName: userName('u-siti-rahmawati') },
    old: true,
  });
  raws.push({
    type: 'ADMIN_PROMOTED',
    createdMs: Date.parse('2025-06-19T03:10:00Z'),
    payload: { byAdminName: userName('u-kenji-matsuda') },
    old: true,
  });
  raws.sort((a, b) => b.createdMs - a.createdMs || cmp(a.type, b.type));
  const notifications: NotificationRecord[] = raws.map((r, i) => {
    const unread = i < 10 && !r.old;
    return {
      id: `n-${pad(i + 1, 2)}`,
      type: r.type,
      payload: r.payload,
      readAt: unread ? null : iso(Math.min(r.createdMs + nRng.int(1, 48) * HOUR, ANCHOR_MS - MIN)),
      createdAt: iso(r.createdMs),
    };
  });

  /* ================================================================== */
  /* Audit                                                               */
  /* ================================================================== */
  const aRng = root.fork('audit');
  const windowLo = ANCHOR_MS - 30 * DAY;
  const windowHi = ANCHOR_MS - HOUR;
  interface ARaw extends Omit<AuditRecord, 'id' | 'createdAt'> {
    createdMs: number;
  }
  const audits: ARaw[] = [];
  const actor = (): string =>
    aRng.weighted(admins, (u) => (u.id === PERSONA_ID ? 5 : u.id === 'u-kenji-matsuda' ? 3 : 2)).id;
  const at = (minMs: number): number => aRng.int(Math.max(windowLo, minMs), windowHi);
  const add = (
    action: string,
    subjectType: string,
    subjectId: string,
    metadata: Record<string, unknown> | null,
    minMs = windowLo,
    actorId: string | null = actor(),
  ): void => {
    // an entry never predates its subject (asset publish date, user sign-up)
    let min = minMs;
    if (subjectType === 'Asset') {
      const w = workById.get(subjectId)!;
      min = Math.max(min, w.publishedMs ?? w.createdMs);
    } else if (subjectType === 'User') {
      min = Math.max(min, Date.parse(userById.get(subjectId)!.createdAt));
    }
    audits.push({ action, subjectType, subjectId, actorId, metadata, createdMs: at(min) });
  };
  for (const r of reports) {
    if (r.status === 'OPEN') continue;
    const created = Date.parse(r.createdAt);
    add('report.start_review', 'Report', r.id, { assetId: r.assetId }, created);
    if (r.status === 'ACTIONED')
      add('report.action', 'Report', r.id, { action: r.action, assetId: r.assetId }, created);
    if (r.status === 'DISMISSED')
      add('report.dismiss', 'Report', r.id, { assetId: r.assetId }, created);
  }
  for (const r of requests) {
    if (r.status === 'SENT') continue;
    add(
      'asset_request.status_change',
      'AssetRequest',
      r.id,
      { from: 'SENT', to: r.status },
      Date.parse(r.createdAt),
    );
  }
  for (const f of featured)
    add('featured.create', 'FeaturedSlot', f.id, { assetId: f.assetId }, Date.parse(f.createdAt));
  add('featured.reorder', 'FeaturedSlot', featured[0].id, { order: featured.map((f) => f.id) });
  add('featured.update', 'FeaturedSlot', featured[1].id, { fields: ['customTitle'] });
  add('featured.update', 'FeaturedSlot', featured[3].id, { fields: ['customShortDescription'] });
  add('user.promote', 'User', 'u-kenji-matsuda', { role: 'admin' });
  add('user.promote', 'User', 'u-siti-rahmawati', { role: 'admin' });
  add('user.demote', 'User', 'u-eleanor-whitfield', { role: 'user' });
  audits.push({
    action: 'me.revoke_device',
    subjectType: 'Device',
    subjectId: 'dev-2',
    actorId: PERSONA_ID,
    metadata: { deviceLabel: devices[1].deviceLabel },
    createdMs: revokedMs,
  });
  add('me.logout', 'User', PERSONA_ID, null, windowLo, PERSONA_ID);
  add('me.logout', 'User', PERSONA_ID, null, windowLo, PERSONA_ID);
  for (const w of aRng.shuffle(archivedOthers).slice(0, 3)) {
    add('archive.purged', 'Asset', w.id, { retentionDays: 30 }, windowLo, null);
  }
  for (const w of archivedOthers) {
    add('asset.admin_archive', 'Asset', w.id, { reason: aRng.pick(C.AUDIT_REASONS) });
  }
  for (const w of aRng.shuffle(published).slice(0, 4)) {
    add('asset.admin_restore', 'Asset', w.id, { reason: aRng.pick(C.AUDIT_REASONS) });
  }
  // ownerId already reflects these transfers (applied right after the assets were built)
  for (const tr of transfers) {
    add('asset.transfer', 'Asset', tr.assetId, {
      fromOwnerId: tr.from,
      toOwnerId: tr.to,
      reason: 'Owner left the team',
    });
  }
  const tagPick = aRng.shuffle(tags);
  for (const tg of tagPick.slice(0, 6)) {
    add('tag.update', 'Tag', tg.id, { before: tg.slug.replace(/-/g, ' '), after: tg.displayName });
  }
  for (const tg of tagPick.slice(6, 8)) {
    add('tag.merge', 'Tag', tg.id, {
      merged: tagPick.slice(8, 10).map((x) => x.slug),
      into: tg.slug,
    });
  }
  for (const c of aRng.shuffle(categories).slice(0, 4))
    add('category.update', 'Category', c.id, { fields: ['name'] });
  for (const c of aRng.shuffle(categories).slice(0, 2))
    add('category.reorder', 'Category', c.id, { sortOrder: c.sortOrder });
  for (const l of aRng.shuffle(licenses).slice(0, 3))
    add('license.update', 'License', l.id, { fields: ['description'] });
  const editFields = ['title', 'shortDescription', 'tags', 'category'];
  const editPool = aRng.shuffle(assets);
  for (let i = 0; audits.length < 120; i++) {
    const a = editPool[i % editPool.length];
    add('asset.admin_edit', 'Asset', a.id, {
      fields: aRng.shuffle(editFields).slice(0, aRng.int(1, 2)),
      reason: aRng.pick(C.AUDIT_REASONS),
    });
  }
  audits.sort(
    (a, b) => a.createdMs - b.createdMs || cmp(a.action + a.subjectId, b.action + b.subjectId),
  );
  const audit: AuditRecord[] = audits.map((a, i) => ({
    id: `au-${pad(i + 1, 3)}`,
    action: a.action,
    subjectType: a.subjectType,
    subjectId: a.subjectId,
    actorId: a.actorId,
    metadata: a.metadata,
    createdAt: iso(a.createdMs),
  }));

  /* ================================================================== */
  /* Webhook deliveries                                                  */
  /* ================================================================== */
  const wRng = root.fork('webhooks');
  const hookStatus: ('success' | 'failure' | 'pending')[] = [
    ...Array<'success'>(22).fill('success'),
    ...Array<'failure'>(7).fill('failure'),
    'pending',
  ];
  const hookRaw = wRng.shuffle(hookStatus).map((status) => {
    const type = wRng.pick(C.WEBHOOK_TYPES);
    const w = wRng.pick(published);
    const createdMs = wRng.int(ANCHOR_MS - 14 * DAY, ANCHOR_MS - 10 * MIN);
    const body: Record<string, unknown> = {
      event: type,
      occurredAt: iso(Math.floor(createdMs / 1000) * 1000),
      asset: { id: w.id, slug: w.entry.slug, title: w.title },
    };
    return { status, type, createdMs, body };
  });
  hookRaw.sort((a, b) => a.createdMs - b.createdMs);
  const webhooks: WebhookDeliveryRecord[] = hookRaw.map((h, i) => {
    const failure = h.status === 'failure';
    const timeout = failure && wRng.chance(0.4);
    return {
      id: `wh-${pad(i + 1, 2)}`,
      type: h.type,
      status: h.status,
      recipient: wRng.pick(C.WEBHOOK_RECIPIENTS),
      attempt: failure ? wRng.int(1, 3) : 1,
      durationMs:
        h.status === 'pending' ? null : timeout ? 10000 : wRng.int(40, failure ? 4000 : 900),
      requestBody: h.body,
      responseStatus:
        h.status === 'pending' || timeout
          ? null
          : failure
            ? wRng.pick([429, 500, 502, 503])
            : wRng.pick([200, 200, 204]),
      responseHeaders:
        h.status === 'pending' || timeout
          ? null
          : { 'content-type': 'application/json', 'x-request-id': `req-${pad(i + 1, 4)}` },
      responseBodyExcerpt:
        h.status === 'pending'
          ? null
          : timeout
            ? 'request timed out after 10000 ms'
            : failure
              ? '{"error":"upstream unavailable"}'
              : '{"ok":true}',
      createdAt: iso(h.createdMs),
    };
  });

  /* ================================================================== */
  /* Storage and analytics                                               */
  /* ================================================================== */
  const sRng = root.fork('storage');
  const MB = 1_048_576;
  const SIZE_MB: Record<string, [number, number]> = {
    '3d-models': [40, 900],
    '2d-art': [5, 200],
    audio: [20, 600],
    vfx: [10, 300],
    animation: [15, 400],
    tools: [1, 60],
    scripts: [0.2, 15],
    templates: [30, 800],
    shaders: [1, 80],
    documents: [0.5, 40],
  };
  const assetSpark = new Map<string, number[]>();
  const assetBytes = new Map<string, number>();
  const storageAssets: StorageRecord[] = [];
  for (const a of assets) {
    const [lo, hi] = SIZE_MB[workById.get(a.id)!.entry.category];
    const bytes = Math.round((lo + (hi - lo) * Math.pow(sRng.next(), 2)) * MB);
    const spark: number[] = [];
    for (let d = 0; d < 30; d++) {
      const dayEnd = END_MS - (29 - d) * DAY + DAY;
      const k = a.versions.filter((v) => Date.parse(v.createdAt) < dayEnd).length;
      spark.push(Math.round((bytes * k) / a.versions.length));
    }
    assetBytes.set(a.id, bytes);
    assetSpark.set(a.id, spark);
    storageAssets.push({
      id: `st-asset-${a.id}`,
      kind: 'asset',
      refId: a.id,
      bytes,
      spark,
      asOfDate: END_DATE,
    });
  }
  const ownerIds = [...new Set(assets.map((a) => a.ownerId))].sort(cmp);
  const storageUsers: StorageRecord[] = ownerIds.map((uid) => {
    const mineA = assets.filter((a) => a.ownerId === uid);
    const spark = Array.from({ length: 30 }, (_, d) =>
      mineA.reduce((s, a) => s + assetSpark.get(a.id)![d], 0),
    );
    return {
      id: `st-user-${uid}`,
      kind: 'user',
      refId: uid,
      bytes: mineA.reduce((s, a) => s + assetBytes.get(a.id)!, 0),
      spark,
      asOfDate: END_DATE,
    };
  });
  const sourceBytes = [...assetBytes.values()].reduce((s, b) => s + b, 0);
  const storageBuckets: StorageRecord[] = [
    {
      id: 'st-bucket-source',
      kind: 'bucket',
      bucket: 'source',
      bytes: sourceBytes,
      asOfDate: END_DATE,
    },
    {
      id: 'st-bucket-derived',
      kind: 'bucket',
      bucket: 'derived',
      bytes: Math.round(sourceBytes * 0.18),
      asOfDate: END_DATE,
    },
    {
      id: 'st-bucket-thumbs',
      kind: 'bucket',
      bucket: 'thumbs',
      bytes: Math.round(assets.length * 1.6 * MB),
      asOfDate: END_DATE,
    },
    {
      id: 'st-bucket-featured',
      kind: 'bucket',
      bucket: 'featured',
      bytes: 5 * 380_000,
      asOfDate: END_DATE,
    },
    {
      id: 'st-bucket-editor',
      kind: 'bucket',
      bucket: 'editor',
      bytes: 24 * MB,
      asOfDate: END_DATE,
    },
  ];
  const storage: StorageRecord[] = [...storageBuckets, ...storageUsers, ...storageAssets];

  /* analytics */
  const anRng = root.fork('analytics');
  const platformDownloads = new Array<number>(90).fill(0);
  const analyticsAssets: AssetAnalyticsRecord[] = [];
  const sum = (xs: number[]): number => xs.reduce((s, x) => s + x, 0);
  for (const a of assets.filter((x) => x.status === 'PUBLISHED')) {
    const w = workById.get(a.id)!;
    const r = anRng.fork(a.id);
    const ageDays = Math.floor((END_MS - w.publishedMs!) / DAY) + 1;
    const avg =
      (a.totalDownloads / (ageDays < 60 ? Math.max(ageDays, 3) : Math.max(ageDays, 60))) *
      (1 + 0.6 * r.next());
    let daily = Array.from({ length: 90 }, (_, i) => {
      const dayMs = END_MS - (89 - i) * DAY;
      if (dayMs < Math.floor(w.publishedMs! / DAY) * DAY) return 0;
      const dow = new Date(dayMs).getUTCDay();
      const x = avg * (0.35 + 1.3 * r.next()) * (dow === 0 || dow === 6 ? 0.75 : 1);
      return Math.floor(x + r.next());
    });
    const cap = Math.floor(a.totalDownloads * 0.92);
    const total = sum(daily);
    if (total > cap) daily = daily.map((x) => Math.floor((x * cap) / total));
    daily.forEach((x, i) => (platformDownloads[i] += x));
    let detail: AssetAnalyticsRecord['detail'] = null;
    if (a.ownerId === PERSONA_ID) {
      const t90 = sum(daily);
      const countryW = C.COUNTRY_WEIGHTS.map(([, wt]) => wt * (0.7 + 0.6 * r.next()));
      const countries = allocate(t90, countryW);
      const byCountry: Record<string, number> = {};
      C.COUNTRY_WEIGHTS.forEach(([code], i) => {
        if (countries[i] > 0) byCountry[code] = countries[i];
      });
      const sw: [number, number, number] =
        a.engine === 'UNITY' ? [62, 33, 5] : a.engine === 'UNREAL' ? [60, 5, 35] : [90, 5, 5];
      const [web, unity, unreal] = allocate(t90, sw);
      const vShare = allocate(
        t90,
        a.versions.map((_v, k) => Math.pow(k + 1, 1.6)),
      );
      detail = {
        daily,
        byCountry,
        bySource: { WEB: web, UNITY: unity, UNREAL: unreal },
        byVersion: a.versions.map((v, k) => ({ versionId: v.id, downloads: vShare[k] })),
        byFile: a.versions.map((v, k) => ({ fileId: v.files[0].id, downloads: vShare[k] })),
      };
    }
    analyticsAssets.push({
      id: `an-${a.id}`,
      kind: 'asset',
      assetId: a.id,
      endDate: END_DATE,
      downloads7d: sum(daily.slice(83)),
      downloads30d: sum(daily.slice(60)),
      detail,
    });
  }
  const platform: PlatformAnalyticsRecord = {
    id: 'an-platform',
    kind: 'platform',
    endDate: END_DATE,
    downloads: platformDownloads,
  };
  const analytics: AnalyticsRecord[] = [platform, ...analyticsAssets];

  const kv: KvMetaRecord[] = [
    {
      id: 'meta',
      value: {
        personaId: PERSONA_ID,
        anchor: iso(ANCHOR_MS),
        seedVersion: SEED_VERSION,
        assetCount: assets.length,
      },
    },
  ];

  return {
    assets,
    users,
    categories,
    tags,
    licenses,
    comments,
    notifications,
    requests,
    reports,
    library,
    audit,
    featured,
    devices,
    webhooks,
    storage,
    analytics,
    kv,
  };
}

/* ------------------------------------------------------------------ */
/* Output                                                              */
/* ------------------------------------------------------------------ */

function render(records: unknown[]): string {
  if (records.length === 0) return '[]\n';
  return `[\n${records.map((r) => JSON.stringify(r)).join(',\n')}\n]\n`;
}

function main(): void {
  const { out } = parseArgs();
  const data: Record<string, unknown[]> = build();
  fs.mkdirSync(out, { recursive: true });
  const order = [
    'assets',
    'users',
    'categories',
    'tags',
    'licenses',
    'comments',
    'notifications',
    'requests',
    'reports',
    'library',
    'audit',
    'featured',
    'devices',
    'webhooks',
    'storage',
    'analytics',
    'kv',
  ];
  let total = 0;
  for (const name of order) {
    const text = render(data[name]);
    fs.writeFileSync(path.join(out, `${name}.json`), text);
    const bytes = Buffer.byteLength(text, 'utf8');
    total += bytes;
    console.log(
      `${name.padEnd(14)} ${String(data[name].length).padStart(5)} records ${String(bytes).padStart(9)} bytes`,
    );
  }
  console.log(`${'total'.padEnd(14)} ${' '.repeat(5)}         ${String(total).padStart(9)} bytes`);
}

main();

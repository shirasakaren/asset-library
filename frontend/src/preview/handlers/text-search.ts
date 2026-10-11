import type { AssetRecord, TagRecord } from '../records';
import type { CatalogMaps } from './helpers';

/** Lowercase, diacritics stripped (NFD, combining marks removed). */
export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase();
}

/** Letters/digits runs of the normalized text. CJK runs stay whole (no word breaks there). */
export function tokenize(s: string): string[] {
  return normalize(s)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

// Scripts without spaces between words: matched as substrings, not by word.
const NO_WORD_BREAKS = /[぀-ヿ㐀-䶿一-鿿豈-﫿가-힯฀-๿]/u;

export interface SearchField {
  text: string;
  weight: number;
}

interface PreparedField {
  norm: string;
  words: string[];
  weight: number;
}

const prepare = (f: SearchField): PreparedField => ({
  norm: normalize(f.text),
  words: tokenize(f.text),
  weight: f.weight,
});

function tokenMatches(token: string, isLast: boolean, f: PreparedField): boolean {
  if (NO_WORD_BREAKS.test(token)) return f.norm.includes(token);
  if (isLast) return f.words.some((w) => w.startsWith(token));
  return f.words.includes(token);
}

export interface ParsedQuery {
  tokens: string[];
  /** Normalized query with single spaces, for the exact-phrase bonus. */
  phrase: string;
}

export function parseQuery(q: string): ParsedQuery {
  const tokens = tokenize(q);
  return { tokens, phrase: tokens.join(' ') };
}

/**
 * Relevance score of a document. Every token must match at least one field
 * (AND semantics); non-final tokens match whole words and the final token also
 * matches as a word prefix. Each matching field adds its weight, and a title
 * that contains the whole phrase gets a small bonus. 0 means "no match".
 */
export function scoreFields(query: ParsedQuery, fields: SearchField[], titleIndex = 0): number {
  if (query.tokens.length === 0) return 0;
  const prepared = fields.map(prepare);
  let score = 0;
  for (let i = 0; i < query.tokens.length; i += 1) {
    const token = query.tokens[i]!;
    const isLast = i === query.tokens.length - 1;
    let tokenScore = 0;
    for (const f of prepared) if (tokenMatches(token, isLast, f)) tokenScore += f.weight;
    if (tokenScore === 0) return 0;
    score += tokenScore;
  }
  const title = prepared[titleIndex];
  if (query.tokens.length > 1 && title && title.words.join(' ').includes(query.phrase)) score += 1;
  return score;
}

const distinct = (xs: (string | undefined)[]): string[] => [
  ...new Set(xs.filter((x): x is string => !!x)),
];

/**
 * Search fields of an asset: title x3 (English/Indonesian titles plus the `originalTitle` of the
 * Japanese-titled listings), tags x2, short description / category / owner x1.
 */
export function assetSearchFields(a: AssetRecord, maps: CatalogMaps): SearchField[] {
  const category = maps.categories.get(a.categoryId);
  const owner = maps.users.get(a.ownerId);
  return [
    {
      text: distinct([a.title, a.titleI18n?.en, a.titleI18n?.id, a.originalTitle]).join(' '),
      weight: 3,
    },
    {
      text: a.tagIds.map((id) => maps.tags.get(id)?.displayName ?? '').join(' '),
      weight: 2,
    },
    {
      text: distinct([
        a.shortDescription,
        a.shortDescriptionI18n?.en,
        a.shortDescriptionI18n?.id,
      ]).join(' '),
      weight: 1,
    },
    { text: distinct([category?.name.en, category?.name.id]).join(' '), weight: 1 },
    { text: owner?.displayName ?? '', weight: 1 },
  ];
}

export function scoreAsset(a: AssetRecord, query: ParsedQuery, maps: CatalogMaps): number {
  return scoreFields(query, assetSearchFields(a, maps));
}

/** Title + tags only (what the library search box matches). */
export function matchesTitleOrTags(a: AssetRecord, query: ParsedQuery, maps: CatalogMaps): boolean {
  const [title, tags] = assetSearchFields(a, maps);
  return scoreFields(query, [title!, tags!]) > 0;
}

/**
 * Tags matching `q`, best first. `prefix` mode keeps names/slugs that START with
 * the query; `search` mode also keeps names/slugs that merely contain it (listed
 * after the prefix matches). Ties are broken by usage (desc), name, id.
 */
export function rankTags(tags: TagRecord[], q: string, mode: 'prefix' | 'search'): TagRecord[] {
  const needle = normalize(q.trim());
  const tier = (t: TagRecord): number => {
    if (!needle) return 0;
    const name = normalize(t.displayName);
    const slug = normalize(t.slug);
    if (name.startsWith(needle) || slug.startsWith(needle)) return 0;
    if (mode === 'search' && (name.includes(needle) || slug.includes(needle))) return 1;
    return -1;
  };
  return tags
    .map((t) => ({ t, tier: tier(t) }))
    .filter((x) => x.tier >= 0)
    .sort(
      (a, b) =>
        a.tier - b.tier ||
        b.t.usageCount - a.t.usageCount ||
        (a.t.displayName < b.t.displayName ? -1 : a.t.displayName > b.t.displayName ? 1 : 0) ||
        (a.t.id < b.t.id ? -1 : 1),
    )
    .map((x) => x.t);
}

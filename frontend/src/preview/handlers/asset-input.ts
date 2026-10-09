import type { Engine, LocaleCode, PreviewMediaVisibility } from '@/lib/api/types';
import { badRequest } from '../router/errors';
import { ENGINES } from './filters';
import type { PreviewMediaInput, Translation } from './asset-write-core';
import { validateFullTipTap } from './tiptap-validate';
import { SEMVER_REGEX } from './publish-checklist';

/**
 * Request-body parsing for `POST /assets` and `PATCH /assets/{id}`: the checks of the backend's
 * `CreateAssetDto` / `UpdateAssetDto` (class-validator), reported as one 400 with `fields`
 * `[{ path, code, message }]`. TipTap descriptions are sanitized on top (`validateFullTipTap`).
 */

type FieldError = { path: string; code: string; message: string };

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

class Errors {
  readonly list: FieldError[] = [];
  add(path: string, code: string, message: string) {
    this.list.push({ path, code, message });
  }
  done() {
    if (this.list.length > 0) {
      throw badRequest(`Validation failed: ${this.list.map((e) => e.path).join(', ')}.`, {
        fields: this.list,
      });
    }
  }
}

const TITLE_MIN = 3;
const TITLE_MAX = 140;
const SLUG_MAX = 120;
const SHORT_MAX = 280;
const MAX_TAGS = 30;
const MAX_PREVIEW = 24;
const MEDIA_KINDS = ['image', 'video', 'audio', '3d'] as const;
const VISIBILITIES: readonly PreviewMediaVisibility[] = ['visible', 'blur', 'hidden'];
const LOCALES: readonly LocaleCode[] = ['en', 'id'];

export interface UpdateInput {
  title?: string;
  slug?: string;
  engine?: Engine;
  semver?: string;
  categoryId?: string;
  licenseId?: string;
  translations?: Translation[];
  tags?: string[];
  requiresEmptyProject?: boolean;
  previewMedia?: PreviewMediaInput[];
}

export interface CreateInput {
  title: string;
  engine: Engine;
  categoryId: string;
  licenseId: string;
  semver: string;
  translations: Translation[];
  tags: string[];
  requiresEmptyProject: boolean;
}

function title(v: unknown, e: Errors): string | undefined {
  if (typeof v !== 'string') {
    e.add('title', 'invalid', 'title must be a string.');
    return undefined;
  }
  const trimmed = v.trim();
  if (trimmed.length < TITLE_MIN || trimmed.length > TITLE_MAX) {
    e.add('title', 'length', `title must be between ${TITLE_MIN} and ${TITLE_MAX} characters.`);
    return undefined;
  }
  return trimmed;
}

function str(v: unknown, path: string, e: Errors): string | undefined {
  if (typeof v === 'string') return v;
  e.add(path, 'invalid', `${path} must be a string.`);
  return undefined;
}

function engine(v: unknown, e: Errors): Engine | undefined {
  if (typeof v === 'string' && (ENGINES as readonly string[]).includes(v)) return v as Engine;
  e.add('engine', 'invalid', `engine must be one of ${ENGINES.join(', ')}.`);
  return undefined;
}

function bool(v: unknown, path: string, e: Errors): boolean | undefined {
  if (typeof v === 'boolean') return v;
  e.add(path, 'invalid', `${path} must be a boolean.`);
  return undefined;
}

function tags(v: unknown, e: Errors): string[] | undefined {
  if (!Array.isArray(v) || v.some((t) => typeof t !== 'string')) {
    e.add('tags', 'invalid', 'tags must be an array of strings.');
    return undefined;
  }
  if (v.length > MAX_TAGS) {
    e.add('tags', 'too_many', `At most ${MAX_TAGS} tags.`);
    return undefined;
  }
  return v as string[];
}

type RawTranslation = Record<string, unknown>;

/** Shape checks of `translations` (collected into `e`); the TipTap sanitizer runs afterwards. */
function translationsShape(v: unknown, e: Errors): RawTranslation[] | undefined {
  if (!Array.isArray(v)) {
    e.add('translations', 'invalid', 'translations must be an array.');
    return undefined;
  }
  if (v.length > 2) {
    e.add('translations', 'too_many', 'At most 2 translations (en, id).');
    return undefined;
  }
  const before = e.list.length;
  const raw = v.map((t, i) => {
    const p = `translations[${i}]`;
    if (!isObject(t)) {
      e.add(p, 'invalid', 'Each translation must be an object.');
      return null;
    }
    if (!LOCALES.includes(t.locale as LocaleCode)) {
      e.add(`${p}.locale`, 'invalid', 'locale must be "en" or "id".');
    }
    if (typeof t.shortDescription !== 'string') {
      e.add(`${p}.shortDescription`, 'invalid', 'shortDescription must be a string.');
    } else if (t.shortDescription.length > SHORT_MAX) {
      e.add(`${p}.shortDescription`, 'length', `At most ${SHORT_MAX} characters.`);
    }
    if (!isObject(t.longDescription)) {
      e.add(`${p}.longDescription`, 'invalid', 'longDescription must be a TipTap document.');
    }
    return t;
  });
  return e.list.length > before ? undefined : (raw as RawTranslation[]);
}

/** Sanitizes the descriptions; a disallowed node or mark throws its own 400. */
function sanitizeTranslations(raw: RawTranslation[]): Translation[] {
  return raw.map((t) => ({
    locale: t.locale as LocaleCode,
    shortDescription: t.shortDescription as string,
    longDescription: validateFullTipTap(t.longDescription),
  }));
}

function previewMedia(v: unknown, e: Errors): PreviewMediaInput[] | undefined {
  if (!Array.isArray(v)) {
    e.add('previewMedia', 'invalid', 'previewMedia must be an array.');
    return undefined;
  }
  if (v.length > MAX_PREVIEW) {
    e.add('previewMedia', 'too_many', `At most ${MAX_PREVIEW} items.`);
    return undefined;
  }
  const out: PreviewMediaInput[] = [];
  v.forEach((m, i) => {
    const p = `previewMedia[${i}]`;
    if (!isObject(m)) {
      e.add(p, 'invalid', 'Each item must be an object.');
      return;
    }
    const optional = (k: string) => m[k] === undefined || m[k] === null;
    const text = (k: string) => {
      if (typeof m[k] !== 'string') e.add(`${p}.${k}`, 'invalid', `${k} must be a string.`);
    };
    text('id');
    text('key');
    text('label');
    if (!MEDIA_KINDS.includes(m.kind as (typeof MEDIA_KINDS)[number])) {
      e.add(`${p}.kind`, 'invalid', `kind must be one of ${MEDIA_KINDS.join(', ')}.`);
    }
    for (const k of ['displayKey', 'mime', 'viewUrl', 'originalUrl']) if (!optional(k)) text(k);
    if (!optional('visibility') && !VISIBILITIES.includes(m.visibility as PreviewMediaVisibility)) {
      e.add(`${p}.visibility`, 'invalid', 'visibility must be visible, blur or hidden.');
    }
    if (!optional('warning') && (typeof m.warning !== 'string' || m.warning.length > 120)) {
      e.add(`${p}.warning`, 'length', 'warning must be a string of at most 120 characters.');
    }
    out.push(m as unknown as PreviewMediaInput);
  });
  return out;
}

function body(raw: unknown, e: Errors): Record<string, unknown> {
  if (!isObject(raw)) {
    e.add('body', 'invalid', 'The request body must be a JSON object.');
    e.done();
  }
  return raw as Record<string, unknown>;
}

/** `PATCH /assets/{id}` body. Absent (or `undefined`) fields are left out; unknown keys are ignored. */
export function parseUpdate(raw: unknown): UpdateInput {
  const e = new Errors();
  const b = body(raw, e);
  const out: UpdateInput = {};
  const has = (k: string) => b[k] !== undefined;

  if (has('title')) out.title = title(b.title, e);
  if (has('slug')) {
    const slug = str(b.slug, 'slug', e);
    if (slug !== undefined) {
      if (slug.length < 1 || slug.length > SLUG_MAX) {
        e.add('slug', 'length', `slug must be between 1 and ${SLUG_MAX} characters.`);
      } else if (!/^[\w-]+$/.test(slug)) {
        e.add('slug', 'invalid', 'slug may only contain letters, digits, "-" and "_".');
      } else out.slug = slug;
    }
  }
  if (has('engine')) out.engine = engine(b.engine, e);
  if (has('semver')) {
    const s = str(b.semver, 'semver', e);
    if (s !== undefined) {
      if (s.length < 1 || s.length > 40)
        e.add('semver', 'length', 'semver must be 1-40 characters.');
      else out.semver = s;
    }
  }
  if (has('categoryId')) out.categoryId = str(b.categoryId, 'categoryId', e);
  if (has('licenseId')) out.licenseId = str(b.licenseId, 'licenseId', e);
  if (has('requiresEmptyProject')) {
    out.requiresEmptyProject = bool(b.requiresEmptyProject, 'requiresEmptyProject', e);
  }
  if (has('tags')) out.tags = tags(b.tags, e);
  if (has('previewMedia')) out.previewMedia = previewMedia(b.previewMedia, e);
  const shape = has('translations') ? translationsShape(b.translations, e) : undefined;
  e.done();
  if (shape) out.translations = sanitizeTranslations(shape);
  return out;
}

/** `POST /assets` body (`CreateAssetDto`). */
export function parseCreate(raw: unknown): CreateInput {
  const e = new Errors();
  const b = body(raw, e);
  const t = title(b.title, e);
  const eng = engine(b.engine, e);
  const categoryId = str(b.categoryId, 'categoryId', e);
  const licenseId = str(b.licenseId, 'licenseId', e);
  let semver: string | undefined;
  if (typeof b.semver !== 'string' || !SEMVER_REGEX.test(b.semver)) {
    e.add('semver', 'invalid', 'semver must look like MAJOR.MINOR.PATCH.');
  } else semver = b.semver;
  const tg = b.tags === undefined ? [] : tags(b.tags, e);
  const empty =
    b.requiresEmptyProject === undefined
      ? false
      : bool(b.requiresEmptyProject, 'requiresEmptyProject', e);
  const shape = translationsShape(b.translations, e);
  e.done();
  return {
    title: t!,
    engine: eng!,
    categoryId: categoryId!,
    licenseId: licenseId!,
    semver: semver!,
    translations: sanitizeTranslations(shape!),
    tags: tg ?? [],
    requiresEmptyProject: empty ?? false,
  };
}

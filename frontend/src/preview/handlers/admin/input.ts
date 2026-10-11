import { badRequest } from '../../router/errors';

/**
 * Small request-body validators shared by the admin handlers. Every handler collects ALL the
 * problems of a body and reports them at once as `fields` (the real API's ProblemDetail shape).
 */

export interface FieldProblem {
  path: string;
  code: string;
  message: string;
}

export type Body = Record<string, unknown>;

/** The body as an object (anything else counts as an empty body). */
export const asBody = (raw: unknown): Body =>
  typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Body) : {};

/** Lowercase kebab-case, as the backend's `SLUG_REGEX`. */
export const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
export const SLUG_MAX = 80;

export class Problems {
  readonly list: FieldProblem[] = [];

  add(path: string, code: string, message: string): void {
    this.list.push({ path, code, message });
  }

  /** Throws the 400 when anything was reported. */
  check(summary = 'Invalid request.'): void {
    if (this.list.length > 0) throw badRequest(summary, { fields: this.list });
  }
}

export interface StringRule {
  min?: number;
  max?: number;
  /** Trim before measuring and storing (default true). */
  trim?: boolean;
}

/**
 * A string field. Returns the value, or `undefined` when absent (`null` counts as absent unless
 * `nullable`, which returns `null`). Wrong type or length is reported on `problems`.
 */
export function readString(
  body: Body,
  key: string,
  problems: Problems,
  rule: StringRule & { required?: boolean; nullable?: boolean } = {},
): string | null | undefined {
  const raw = body[key];
  if (raw === undefined || raw === null) {
    if (raw === null && rule.nullable) return null;
    if (rule.required) problems.add(key, 'required', `${key} must be a string.`);
    return undefined;
  }
  if (typeof raw !== 'string') {
    problems.add(key, 'invalid', `${key} must be a string.`);
    return undefined;
  }
  const value = rule.trim === false ? raw : raw.trim();
  if (rule.min !== undefined && value.length < rule.min) {
    problems.add(key, 'too_short', `${key} must be at least ${rule.min} characters.`);
    return undefined;
  }
  if (rule.max !== undefined && value.length > rule.max) {
    problems.add(key, 'too_long', `${key} must be at most ${rule.max} characters.`);
    return undefined;
  }
  return value;
}

export function readBoolean(body: Body, key: string, problems: Problems): boolean | undefined {
  const raw = body[key];
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'boolean') {
    problems.add(key, 'invalid', `${key} must be a boolean.`);
    return undefined;
  }
  return raw;
}

/** A non-negative integer (`sortOrder`). */
export function readCount(body: Body, key: string, problems: Problems): number | undefined {
  const raw = body[key];
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0) {
    problems.add(key, 'invalid', `${key} must be an integer of at least 0.`);
    return undefined;
  }
  return raw;
}

/** `{ en?, id? }`, each a string. `requireBoth` needs both locales (create). */
export function readI18n(
  body: Body,
  key: string,
  problems: Problems,
  opts: { requireBoth?: boolean; nonEmpty?: ReadonlyArray<'en' | 'id'>; max?: number } = {},
): Partial<Record<'en' | 'id', string>> | undefined {
  const raw = body[key];
  if (raw === undefined || raw === null) {
    if (opts.requireBoth) problems.add(key, 'required', `${key} must be an object with en and id.`);
    return undefined;
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    problems.add(key, 'invalid', `${key} must be an object.`);
    return undefined;
  }
  const out: Partial<Record<'en' | 'id', string>> = {};
  for (const locale of ['en', 'id'] as const) {
    const v = (raw as Body)[locale];
    if (v === undefined || v === null) {
      if (opts.requireBoth)
        problems.add(`${key}.${locale}`, 'required', `${key}.${locale} is required.`);
      continue;
    }
    if (typeof v !== 'string') {
      problems.add(`${key}.${locale}`, 'invalid', `${key}.${locale} must be a string.`);
      continue;
    }
    if (opts.nonEmpty?.includes(locale) && !v.trim()) {
      problems.add(`${key}.${locale}`, 'required', `${key}.${locale} must not be empty.`);
      continue;
    }
    if (opts.max !== undefined && v.length > opts.max) {
      problems.add(`${key}.${locale}`, 'too_long', `${key}.${locale} is too long.`);
      continue;
    }
    out[locale] = v;
  }
  return out;
}

/**
 * `orderedIds`: a non-empty array of distinct strings. Duplicates are a 400 (the backend would
 * write the same row twice and leave a gap).
 */
export function readOrderedIds(raw: unknown, key = 'orderedIds'): string[] {
  const body = asBody(raw);
  const value = body[key];
  const problems = new Problems();
  if (!Array.isArray(value) || value.length === 0 || value.some((v) => typeof v !== 'string')) {
    problems.add(key, 'invalid', `${key} must be a non-empty array of ids.`);
    problems.check();
  }
  const ids = value as string[];
  if (new Set(ids).size !== ids.length) {
    problems.add(key, 'duplicate', `${key} must not contain the same id twice.`);
  }
  problems.check();
  return ids;
}

/** `slugify` as the category modal does (lowercase, hyphens, no punctuation). */
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

import type { TipTapDoc } from '@/lib/api/types';
import { badRequest } from '../router/errors';

/**
 * Port of `backend/src/common/tiptap/validate.ts` (structural walk, no TipTap runtime):
 * unknown attributes are stripped, disallowed nodes / marks are a 400 with `fields`, links get
 * `rel="noopener nofollow"`. Used for asset descriptions (full) and release notes (lite).
 * (Comments use the lighter `validateLiteBody` in `comment-core.ts`.)
 */

interface Node {
  type: string;
  attrs?: Record<string, unknown>;
  content?: Node[];
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  text?: string;
}

interface Allowlist {
  nodes: Set<string>;
  marks: Set<string>;
  nodeAttrs: Record<string, Set<string>>;
  markAttrs: Record<string, Set<string>>;
  maxBytes: number;
  maxHeadingLevel?: number;
  code: string;
}

const FULL: Allowlist = {
  nodes: new Set([
    'doc',
    'paragraph',
    'heading',
    'bulletList',
    'orderedList',
    'listItem',
    'blockquote',
    'codeBlock',
    'image',
    'video',
    'embed',
    // The editor's YouTube extension emits `youtube` (the real API would reject it).
    'youtube',
    'horizontalRule',
    'hardBreak',
    'table',
    'tableRow',
    'tableCell',
    'tableHeader',
    'text',
  ]),
  marks: new Set([
    'bold',
    'italic',
    'underline',
    'strike',
    'code',
    'link',
    'highlight',
    'textStyle',
    'subscript',
    'superscript',
  ]),
  nodeAttrs: {
    heading: new Set(['level']),
    image: new Set(['src', 'alt', 'title', 'width', 'height']),
    video: new Set(['src', 'poster', 'width', 'height']),
    embed: new Set(['src', 'provider']),
    youtube: new Set(['src', 'start', 'width', 'height']),
    codeBlock: new Set(['language']),
    tableCell: new Set(['colspan', 'rowspan', 'colwidth']),
    tableHeader: new Set(['colspan', 'rowspan', 'colwidth']),
  },
  markAttrs: {
    link: new Set(['href', 'target', 'rel']),
    highlight: new Set(['color']),
    textStyle: new Set(['color']),
  },
  maxBytes: 100 * 1024,
  maxHeadingLevel: 3,
  code: 'comment.long_tiptap_violation',
};

const LITE: Allowlist = {
  nodes: new Set([
    'doc',
    'paragraph',
    'bulletList',
    'orderedList',
    'listItem',
    'codeBlock',
    'hardBreak',
    'text',
    'mention',
    'image',
  ]),
  marks: new Set(['bold', 'italic', 'code', 'link']),
  nodeAttrs: {
    codeBlock: new Set(['language']),
    mention: new Set(['id', 'label']),
    image: new Set(['src', 'alt', 'title']),
  },
  markAttrs: { link: new Set(['href', 'target', 'rel']) },
  maxBytes: 24 * 1024,
  code: 'comment.lite_tiptap_violation',
};

interface Violation {
  path: string;
  code: string;
  message: string;
}

function walk(node: Node, path: string, list: Allowlist, out: Violation[]): Node {
  const copy: Node = { type: node.type };
  if (!list.nodes.has(node.type)) {
    out.push({
      path,
      code: 'node.disallowed',
      message: `Node type "${node.type}" is not allowed.`,
    });
    return copy;
  }
  if (node.type === 'heading' && typeof node.attrs?.level === 'number') {
    const max = list.maxHeadingLevel ?? 3;
    if (node.attrs.level < 1 || node.attrs.level > max) {
      out.push({
        path: `${path}.attrs.level`,
        code: 'heading.level_out_of_range',
        message: `Heading level must be 1..${max}.`,
      });
    }
  }
  if (node.attrs) {
    const allowed = list.nodeAttrs[node.type];
    if (allowed) {
      const kept = Object.fromEntries(Object.entries(node.attrs).filter(([k]) => allowed.has(k)));
      if (Object.keys(kept).length > 0) copy.attrs = kept;
    }
  }
  if (Array.isArray(node.marks)) {
    const safe: NonNullable<Node['marks']> = [];
    node.marks.forEach((mark, i) => {
      if (!list.marks.has(mark.type)) {
        out.push({
          path: `${path}.marks[${i}]`,
          code: 'mark.disallowed',
          message: `Mark "${mark.type}" is not allowed.`,
        });
        return;
      }
      const allowed = list.markAttrs[mark.type];
      const attrs: Record<string, unknown> = {};
      if (mark.attrs && allowed) {
        for (const [k, v] of Object.entries(mark.attrs)) if (allowed.has(k)) attrs[k] = v;
      }
      // Never persist a bare external href.
      if (mark.type === 'link') {
        attrs.rel = 'noopener nofollow';
        if (!attrs.target) attrs.target = '_blank';
      }
      safe.push({ type: mark.type, attrs: Object.keys(attrs).length ? attrs : undefined });
    });
    if (safe.length) copy.marks = safe;
  }
  if (typeof node.text === 'string') copy.text = node.text;
  if (Array.isArray(node.content) && node.content.length) {
    copy.content = node.content.map((c, i) => walk(c, `${path}.content[${i}]`, list, out));
  }
  return copy;
}

function validate(doc: unknown, list: Allowlist): TipTapDoc {
  if (!doc || typeof doc !== 'object') {
    throw badRequest('TipTap document must be an object.', { code: list.code });
  }
  if (new TextEncoder().encode(JSON.stringify(doc)).length > list.maxBytes) {
    throw badRequest(`TipTap document exceeds ${list.maxBytes} bytes.`, { code: list.code });
  }
  if ((doc as Node).type !== 'doc') {
    throw badRequest('Root TipTap node must be type "doc".', { code: list.code });
  }
  const violations: Violation[] = [];
  const sanitized = walk(doc as Node, '$', list, violations);
  if (violations.length > 0) {
    throw badRequest('TipTap document contains disallowed content.', {
      code: list.code,
      fields: violations,
    });
  }
  return sanitized as unknown as TipTapDoc;
}

/** Full asset-description editor. */
export const validateFullTipTap = (doc: unknown): TipTapDoc => validate(doc, FULL);

/** Release notes (`{ en?, id? }` values). */
export const validateLiteTipTap = (doc: unknown): TipTapDoc => validate(doc, LITE);

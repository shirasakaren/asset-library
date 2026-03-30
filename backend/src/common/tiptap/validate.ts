import { BadRequestDomainException, ProblemFieldDto } from '../errors/problem.dto';
import { ErrorCode, ErrorCodeValue } from '../errors/error-code';

/**
 * Minimal TipTap document model. We don't pull TipTap's runtime in just for
 * validation — the JSON contract is stable enough that a structural walk
 * suffices.
 */
export interface TipTapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TipTapNode[];
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  text?: string;
}

export interface TipTapDoc {
  type: 'doc';
  content?: TipTapNode[];
}

export interface TipTapAllowlist {
  /** Allowed node `type` values. */
  nodes: Set<string>;
  /** Allowed mark `type` values. */
  marks: Set<string>;
  /** Per-node allowed attribute keys (unknown attrs are silently stripped). */
  nodeAttrs: Record<string, Set<string>>;
  /** Per-mark allowed attribute keys. */
  markAttrs: Record<string, Set<string>>;
  /** Maximum serialized size in bytes. */
  maxBytes: number;
  /** Maximum heading level (only relevant when `heading` is allowed). */
  maxHeadingLevel?: number;
}

/** Allowlist for the full asset-description editor. */
export const FULL_TIPTAP_ALLOWLIST: TipTapAllowlist = {
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
};

/** Allowlist for the lite editor (comments + release notes). */
export const LITE_TIPTAP_ALLOWLIST: TipTapAllowlist = {
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
    // Inline media: uploaded images and embedded GIFs (both render as image
    // nodes pointing at our editor-media bucket or a provider CDN).
    'image',
  ]),
  marks: new Set(['bold', 'italic', 'code', 'link']),
  nodeAttrs: {
    codeBlock: new Set(['language']),
    mention: new Set(['id', 'label']),
    image: new Set(['src', 'alt', 'title']),
  },
  markAttrs: {
    link: new Set(['href', 'target', 'rel']),
  },
  // Bumped from 10 KiB — image src URLs (presigned S3 / provider CDN) are long.
  maxBytes: 24 * 1024,
};

interface WalkState {
  violations: ProblemFieldDto[];
  allowlist: TipTapAllowlist;
}

function isTipTapNode(node: TipTapNode | TipTapDoc): node is TipTapNode {
  return node.type !== 'doc' || 'attrs' in node || 'marks' in node || 'text' in node;
}

function walk(node: TipTapNode | TipTapDoc, path: string, state: WalkState): TipTapNode {
  const typedNode: TipTapNode = isTipTapNode(node)
    ? node
    : { type: node.type, content: node.content };
  const out: TipTapNode = { type: node.type };
  if (!state.allowlist.nodes.has(node.type)) {
    state.violations.push({
      path,
      code: 'node.disallowed',
      message: `Node type "${node.type}" is not allowed.`,
    });
    return out;
  }
  if (node.type === 'heading' && typeof typedNode.attrs?.level === 'number') {
    const max = state.allowlist.maxHeadingLevel ?? 3;
    if (typedNode.attrs.level < 1 || typedNode.attrs.level > max) {

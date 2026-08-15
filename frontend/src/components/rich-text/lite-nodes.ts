import type { TipTapDoc, TipTapNode } from '@/lib/api/types';

/**
 * Pure (non-React) Lite-mode sanitization helpers, mirroring the backend.
 *
 * These live in their own module — separate from `rich-text-editor.tsx` — so
 * callers that only need `stripDisallowedLiteNodes` (comment composer/thread)
 * do NOT pull the whole TipTap editor (and its heavy deps) into their bundle.
 * The editor component itself is lazy-loaded via `rich-text-editor.lazy.tsx`.
 *
 * Allowed nodes/marks for Lite mode (comments, release notes). Any disallowed
 * nodes are stripped before submit by the caller via `stripDisallowedLiteNodes`.
 */
export const LITE_ALLOWED_NODES = new Set([
  'doc',
  'paragraph',
  'text',
  'hardBreak',
  'bulletList',
  'orderedList',
  'listItem',
  'codeBlock',
  'image',
]);

export const LITE_ALLOWED_MARKS = new Set(['bold', 'italic', 'code', 'link']);

export function stripDisallowedLiteNodes(doc: TipTapDoc): TipTapDoc {
  return {
    type: 'doc',
    content: (doc.content ?? [])
      .map(filterLiteNode)
      .filter((n): n is NonNullable<typeof n> => n !== null),
  };
}

function filterLiteNode(node: TipTapNode): TipTapNode | null {
  if (!LITE_ALLOWED_NODES.has(node.type)) return null;
  const marks = node.marks?.filter((m) => LITE_ALLOWED_MARKS.has(m.type));
  const content = node.content?.map(filterLiteNode).filter((n): n is TipTapNode => n !== null);
  return {
    ...node,
    marks: marks?.length ? marks : undefined,
    content: content?.length ? content : node.content ? [] : undefined,
  };
}

'use client';

import dynamic from 'next/dynamic';

/**
 * Lazy entry point for the TipTap rich-text editor.
 *
 * Importing the editor through this module keeps TipTap (and its sizeable
 * extension/prosemirror dependency graph) out of the initial bundle of every
 * page that mounts a composer/editor. The component is client-only (`ssr:
 * false`) since TipTap has no meaningful SSR output.
 *
 * Pure sanitization helpers live in `./lite-nodes` — import those directly so
 * they never drag the editor chunk in.
 */
export const RichTextEditor = dynamic(
  () => import('./rich-text-editor').then((m) => m.RichTextEditor),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-[120px] animate-pulse rounded-[12px] border border-line bg-surface-muted" />
    ),
  },
);

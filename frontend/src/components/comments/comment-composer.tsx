'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { RichTextEditor } from '@/components/rich-text/rich-text-editor.lazy';
import { stripDisallowedLiteNodes } from '@/components/rich-text/lite-nodes';
import { avatarFromServer } from '@/lib/avatar';
import { logEvent } from '@/lib/logger.events';
import type { CommentKind, MeResponse, TipTapDoc } from '@/lib/api/types';

interface CommentComposerProps {
  me: MeResponse;
  onSubmit: (input: { kind: CommentKind; body: TipTapDoc }) => Promise<void>;
  defaultKind?: CommentKind;
  autoFocus?: boolean;
}

function hasContent(doc: TipTapDoc): boolean {
  let total = 0;
  let hasMedia = false;
  const visit = (node: { type: string; text?: string; content?: typeof node[] }) => {
    if (node.type === 'text' && node.text) total += node.text.trim().length;
    if (node.type === 'image') hasMedia = true;
    node.content?.forEach(visit);
  };
  (doc.content ?? []).forEach((n) => visit(n as Parameters<typeof visit>[0]));
  return total > 0 || hasMedia;
}

export function CommentComposer({
  me,
  onSubmit,
  defaultKind = 'COMMENT',
  autoFocus,
}: CommentComposerProps) {
  const t = useTranslations('comments');
  const [kind, setKind] = useState<CommentKind>(defaultKind);
  const [doc, setDoc] = useState<TipTapDoc>({ type: 'doc', content: [] });
  const [submitting, setSubmitting] = useState(false);
  // Bumped after a successful submit to force the (uncontrolled) editor to
  // remount with empty content — the editor no longer re-syncs from `value`.
  const [editorEpoch, setEditorEpoch] = useState(0);
  const ready = hasContent(doc);

  const handleSubmit = async () => {
    if (!ready || submitting) return;
    const safe = stripDisallowedLiteNodes(doc);
    setSubmitting(true);
    try {
      await onSubmit({ kind, body: safe });
      setDoc({ type: 'doc', content: [] });
      setEditorEpoch((n) => n + 1);
      logEvent('comment.compose_submit', { kind });
    } finally {

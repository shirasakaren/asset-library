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
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-[16px] border border-line bg-surface p-4">
      <div className="flex items-start gap-3">
        <Avatar data={avatarFromServer(me.avatar)} size={32} />
        <div className="flex-1 min-w-0">
          <RichTextEditor
            key={editorEpoch}
            mode="lite"
            value={doc}
            onChange={setDoc}
            autoFocus={autoFocus}
            placeholder="Share what you think…"
            minHeight={92}
            maxHeight={240}
          />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <fieldset className="inline-flex items-center gap-3">
          <legend className="sr-only">{t('kindLabel')}</legend>
          <label className="inline-flex items-center gap-2 text-[13.5px] text-ink cursor-pointer">
            <input
              type="radio"
              checked={kind === 'COMMENT'}
              onChange={() => setKind('COMMENT')}
              className="h-4 w-4 accent-ink"
            />
            {t('kindComment')}
          </label>
          <label className="inline-flex items-center gap-2 text-[13.5px] text-ink cursor-pointer">
            <input
              type="radio"
              checked={kind === 'ISSUE'}
              onChange={() => setKind('ISSUE')}
              className="h-4 w-4 accent-ink"
            />
            {t('kindIssue')}
          </label>
        </fieldset>
        <Button onClick={handleSubmit} disabled={!ready} loading={submitting} className="ml-auto">
          {t('submit')}
        </Button>
      </div>

      {kind === 'ISSUE' ? (
        <Alert variant="warning" className="mt-3">
          {t('issueBanner')}
        </Alert>
      ) : null}
    </div>
  );
}

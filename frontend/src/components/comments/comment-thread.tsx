'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { MoreHorizontal, MessageSquare, Pencil, Trash2, Link as LinkIcon } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { TipTapRenderer } from '@/components/rich-text/tiptap-renderer';
import { RichTextEditor } from '@/components/rich-text/rich-text-editor.lazy';
import { stripDisallowedLiteNodes } from '@/components/rich-text/lite-nodes';
import { Button } from '@/components/ui/button';
import { CommentComposer } from './comment-composer';
import { avatarFromServer } from '@/lib/avatar';
import { formatRelative } from '@/lib/format';
import { toast } from '@/components/ui/toaster';
import type { CommentKind, CommentNode, IssueStatus, LocaleCode, MeResponse, TipTapDoc } from '@/lib/api/types';
import { cn } from '@/lib/utils';

interface CommentThreadProps {
  node: CommentNode;
  me: MeResponse;
  isAssetOwner: boolean;
  depth?: number;
  onReply: (parentId: string, body: TipTapDoc) => Promise<void>;
  onEdit: (id: string, body: TipTapDoc) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onStatus: (id: string, status: IssueStatus) => Promise<void>;
}

const MAX_DEPTH = 5;

const STATUS_VARIANT: Record<IssueStatus, 'neutral' | 'info' | 'success'> = {
  OPEN: 'neutral',
  ACKNOWLEDGED: 'info',
  RESOLVED: 'success',
};

export function CommentThread(props: CommentThreadProps) {
  const { node, me, isAssetOwner, depth = 0 } = props;
  const t = useTranslations('comments');
  const locale = useLocale() as LocaleCode;
  const [replying, setReplying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editDoc, setEditDoc] = useState<TipTapDoc>(node.body);

  const isAuthor = node.author.id === me.id;
  const isAdmin = me.isAdmin;
  const canEdit = isAuthor;
  const canDelete = isAdmin;
  const canChangeStatus = (isAssetOwner || isAdmin) && node.kind === 'ISSUE';

  const copyLink = async () => {
    try {
      const url = `${window.location.origin}${window.location.pathname}#comment-${node.id}`;
      await navigator.clipboard.writeText(url);
      toast.success(t('copied'));
    } catch {
      /* ignore */
    }
  };

  return (
    <article
      id={`comment-${node.id}`}
      className={cn(
        'rounded-[16px] border border-line bg-surface p-4',
        depth > 0 && 'border-line/70',
      )}
    >
      <div className="flex items-start gap-3">
        <Avatar data={avatarFromServer(node.author.avatar)} size={32} />
        <div className="flex-1 min-w-0">
          <header className="flex flex-wrap items-center gap-2">
            <span className="text-[14px] font-semibold text-ink">{node.author.displayName}</span>
            {node.author.id === me.id ? (
              <Badge variant="neutral" size="sm">
                You
              </Badge>
            ) : null}
            <span className="text-caption text-ink-3 geist-tnum" title={new Date(node.createdAt).toLocaleString()}>
              {formatRelative(node.createdAt, locale)}
            </span>
            {node.editedAt ? <Badge variant="neutral" size="sm">{t('editedPill')}</Badge> : null}
            {node.kind === 'ISSUE' && node.status ? (
              <Badge variant={STATUS_VARIANT[node.status]} size="sm">
                {t(`status.${node.status}` as 'status.OPEN')}
              </Badge>
            ) : null}
          </header>

          <div className="mt-2">
            {editing ? (
              <>
                <RichTextEditor
                  mode="lite"
                  value={editDoc}
                  onChange={setEditDoc}
                  autoFocus
                  minHeight={90}
                />
                <div className="mt-2 flex items-center justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => { setEditing(false); setEditDoc(node.body); }}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={async () => {
                      await props.onEdit(node.id, stripDisallowedLiteNodes(editDoc));
                      setEditing(false);
                    }}
                  >
                    Save
                  </Button>
                </div>
              </>
            ) : (
              <TipTapRenderer doc={node.body} variant="lite" className="text-body-sm" />
            )}
          </div>

          {!editing ? (
            <footer className="mt-3 flex items-center gap-3 text-caption text-ink-3">
              {depth < MAX_DEPTH ? (
                <button
                  type="button"
                  onClick={() => setReplying((r) => !r)}
                  className="inline-flex items-center gap-1 hover:text-ink transition-colors"
                >
                  <MessageSquare className="h-3 w-3" strokeWidth={2.25} />
                  {t('reply')}
                </button>
              ) : null}
              {canChangeStatus ? (
                <ChangeStatus
                  current={node.status ?? 'OPEN'}
                  onChange={(s) => props.onStatus(node.id, s)}
                />
              ) : null}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="More"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-[8px] hover:bg-surface-muted text-ink-3 hover:text-ink transition-colors"
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" strokeWidth={2.25} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={copyLink}>
                    <LinkIcon className="h-3.5 w-3.5" strokeWidth={2.25} />
                    {t('copyLink')}
                  </DropdownMenuItem>
                  {canEdit ? (
                    <DropdownMenuItem onSelect={() => setEditing(true)}>
                      <Pencil className="h-3.5 w-3.5" strokeWidth={2.25} />
                      {t('edit')}
                    </DropdownMenuItem>
                  ) : null}
                  {canDelete ? (
                    <DropdownMenuItem
                      danger
                      onSelect={() => void props.onDelete(node.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={2.25} />
                      {t('delete')}
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            </footer>
          ) : null}

          {replying ? (
            <div className="mt-3 pl-4 border-l-2 border-line">
              <CommentComposer
                me={me}
                defaultKind="COMMENT"
                autoFocus
                onSubmit={async ({ body }) => {
                  await props.onReply(node.id, body);
                  setReplying(false);
                }}
              />
            </div>
          ) : null}

          {node.replies.length > 0 ? (
            <ul className="mt-3 space-y-2 pl-4 sm:pl-8 border-l border-line/60">
              {node.replies.map((child) => (
                <li key={child.id}>
                  {depth + 1 >= MAX_DEPTH ? (
                    <p className="text-caption text-ink-3 italic px-2 py-1">{t('maxDepth')}</p>
                  ) : (
                    <CommentThread
                      {...props}
                      node={child}
                      depth={depth + 1}
                    />
                  )}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function ChangeStatus({
  current,
  onChange,
}: {
  current: IssueStatus;
  onChange: (s: IssueStatus) => void;
}) {
  const t = useTranslations('comments');
  return (
    <select
      aria-label={t('changeStatus')}
      value={current}
      onChange={(e) => onChange(e.target.value as IssueStatus)}
      className="h-7 rounded-[8px] border border-line bg-surface text-[12px] px-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 cursor-pointer"
    >
      <option value="OPEN">{t('status.OPEN')}</option>
      <option value="ACKNOWLEDGED">{t('status.ACKNOWLEDGED')}</option>
      <option value="RESOLVED">{t('status.RESOLVED')}</option>
    </select>
  );
}

// Silence unused exports
export { type CommentKind };

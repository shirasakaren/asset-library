import {
  MessageCircle,
  Reply,
  AlertCircle,
  CheckCircle2,
  Inbox,
  Plus,
  Flag,
  Star,
  RefreshCw,
  AlertTriangle,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { NotificationType } from '@/lib/api/types';

const ICON_MAP: Record<NotificationType, LucideIcon> = {
  COMMENT_CREATED: MessageCircle,
  COMMENT_REPLY: Reply,
  ISSUE_CREATED: AlertCircle,
  ISSUE_STATUS_CHANGED: CheckCircle2,
  REQUEST_STATUS_CHANGED: Inbox,
  REQUEST_CREATED: Plus,
  REPORT_RECEIVED_FOR_YOUR_ASSET: Flag,
  REPORT_CREATED: Flag,
  FEATURED_FEATURED: Star,
  VERSION_PUBLISHED: RefreshCw,
  ANALYZER_FAILED: AlertTriangle,
  ADMIN_PROMOTED: ShieldCheck,
  ADMIN_DEMOTED: ShieldCheck,
};

const TINT_MAP: Record<NotificationType, string> = {
  COMMENT_CREATED: 'bg-brand-blue-50 text-brand-blue',
  COMMENT_REPLY: 'bg-brand-blue-50 text-brand-blue',
  ISSUE_CREATED: 'bg-brand-yellow-50 text-[#a16800]',
  ISSUE_STATUS_CHANGED: 'bg-brand-green-50 text-brand-green',
  REQUEST_STATUS_CHANGED: 'bg-brand-blue-50 text-brand-blue',
  REQUEST_CREATED: 'bg-brand-blue-50 text-brand-blue',
  REPORT_RECEIVED_FOR_YOUR_ASSET: 'bg-brand-yellow-50 text-[#a16800]',
  REPORT_CREATED: 'bg-brand-red-50 text-brand-red',
  FEATURED_FEATURED: 'bg-brand-yellow-50 text-[#a16800]',
  VERSION_PUBLISHED: 'bg-brand-green-50 text-brand-green',
  ANALYZER_FAILED: 'bg-brand-red-50 text-brand-red',
  ADMIN_PROMOTED: 'bg-brand-green-50 text-brand-green',
  ADMIN_DEMOTED: 'bg-surface-muted text-ink-2',
};

export function NotificationIcon({ type, className }: { type: string; className?: string }) {
  const t = (type as NotificationType) || 'COMMENT_CREATED';
  const Icon = ICON_MAP[t] ?? Inbox;
  const tint = TINT_MAP[t] ?? 'bg-surface-muted text-ink-2';
  return (
    <span className={cn('inline-flex h-8 w-8 items-center justify-center rounded-[10px]', tint, className)}>
      <Icon className="h-4 w-4" strokeWidth={2.25} />
    </span>
  );
}

export function notificationLink(type: string, payload: Record<string, unknown>): string {
  const t = (type as NotificationType) ?? 'COMMENT_CREATED';
  const slug = String(payload.assetSlug ?? '');
  const commentId = String(payload.commentId ?? '');
  switch (t) {
    case 'COMMENT_CREATED':
    case 'COMMENT_REPLY':
      return slug ? `/assets/${slug}#comment-${commentId}` : '/notifications';
    case 'ISSUE_CREATED':
    case 'ISSUE_STATUS_CHANGED':
      return slug ? `/assets/${slug}#issues` : '/notifications';
    case 'REQUEST_STATUS_CHANGED':
    case 'REQUEST_CREATED':
      return '/request';
    case 'REPORT_RECEIVED_FOR_YOUR_ASSET':
      return slug ? `/assets/${slug}` : '/notifications';
    case 'REPORT_CREATED':
      return '/admin/reports';
    case 'FEATURED_FEATURED':
    case 'VERSION_PUBLISHED':
      return slug ? `/assets/${slug}` : '/notifications';
    case 'ANALYZER_FAILED':
      return payload.assetId ? `/publish/${payload.assetId}` : '/notifications';
    case 'ADMIN_PROMOTED':
    case 'ADMIN_DEMOTED':
      return '/admin';
    default:
      return '/notifications';
  }
}

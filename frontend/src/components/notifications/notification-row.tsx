'use client';

import NextLink from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { NotificationIcon, notificationLink } from './notification-icon';
import { formatRelative } from '@/lib/format';
import type { LocaleCode, NotificationItem, NotificationType } from '@/lib/api/types';
import { cn } from '@/lib/utils';

interface Props {
  item: NotificationItem;
  onActivate?: (id: string, href: string) => void;
  dense?: boolean;
}

export function NotificationRow({ item, onActivate, dense }: Props) {
  const t = useTranslations('notif.type');
  const locale = useLocale() as LocaleCode;
  const href = notificationLink(item.type, item.payload);
  const message = renderMessage(item.type, item.payload, (key, vars) =>
    t(key as 'COMMENT_CREATED', vars as Record<string, string | number | Date> | undefined),
  );
  const isUnread = !item.readAt;
  return (
    <NextLink
      href={href}
      onClick={() => onActivate?.(item.id, href)}
      className={cn(
        'flex items-start gap-3 p-3 rounded-[10px] transition-colors duration-120 group',
        'hover:bg-surface-muted/60',
        isUnread && 'bg-brand-blue-50/30',
        dense ? '' : 'p-4',
      )}
    >
      <NotificationIcon type={item.type} />
      <div className="flex-1 min-w-0">
        <p className="text-[13.5px] text-ink leading-[1.5]">{message}</p>
        <p className="text-caption text-ink-3 mt-0.5 geist-tnum">
          {formatRelative(item.createdAt, locale)}
        </p>
      </div>
      {isUnread ? (
        <span aria-label="Unread" className="mt-2 inline-block h-2 w-2 rounded-full bg-brand-blue shrink-0" />
      ) : null}
    </NextLink>
  );
}

function renderMessage(
  type: string,
  payload: Record<string, unknown>,
  t: (key: string, vars?: Record<string, unknown>) => string,
): React.ReactNode {
  const known: NotificationType[] = [
    'COMMENT_CREATED',
    'COMMENT_REPLY',
    'ISSUE_CREATED',
    'ISSUE_STATUS_CHANGED',
    'REQUEST_STATUS_CHANGED',
    'REQUEST_CREATED',
    'REPORT_RECEIVED_FOR_YOUR_ASSET',
    'REPORT_CREATED',
    'FEATURED_FEATURED',
    'VERSION_PUBLISHED',
    'ANALYZER_FAILED',
    'ADMIN_PROMOTED',
    'ADMIN_DEMOTED',
  ];
  if (!known.includes(type as NotificationType)) return type;
  return t(type, {
    author: String(payload.authorDisplayName ?? ''),
    asset: String(payload.assetTitle ?? ''),
    requester: String(payload.requesterName ?? ''),
    status: String(payload.status ?? ''),
    category: String(payload.category ?? ''),
    semver: String(payload.semver ?? ''),
    version: String(payload.versionLabel ?? payload.semver ?? ''),
    owner: String(payload.ownerName ?? ''),
    by: String(payload.byAdminName ?? ''),
  });
}

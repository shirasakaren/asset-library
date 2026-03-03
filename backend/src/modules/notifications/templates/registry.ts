import { NotificationType } from '@prisma/client';

/**
 * Each event maps to a folder under `templates/<event>/` containing `en.mjml`,
 * `id.mjml`, and a `subjects.json` keyed by locale. The renderer walks this
 * registry to find the right files.
 */
export const NOTIFICATION_TEMPLATES: Record<NotificationType, string> = {
  [NotificationType.COMMENT_CREATED]: 'comment-created',
  [NotificationType.COMMENT_REPLY]: 'comment-reply',
  [NotificationType.ISSUE_CREATED]: 'issue-created',
  [NotificationType.ISSUE_STATUS_CHANGED]: 'issue-status-changed',
  [NotificationType.REQUEST_CREATED]: 'request-created-to-admin',
  [NotificationType.REQUEST_STATUS_CHANGED]: 'request-status-changed',
  [NotificationType.REPORT_CREATED]: 'report-created-to-admin',
  [NotificationType.REPORT_RECEIVED_FOR_YOUR_ASSET]: 'report-received-for-your-asset',
  [NotificationType.FEATURED_FEATURED]: 'featured',
  [NotificationType.VERSION_PUBLISHED]: 'version-published',
  [NotificationType.ANALYZER_FAILED]: 'analyzer-failed',
  [NotificationType.ADMIN_PROMOTED]: 'admin-promoted',
  [NotificationType.ADMIN_DEMOTED]: 'admin-demoted',
};

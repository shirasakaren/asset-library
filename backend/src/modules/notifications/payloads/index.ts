import { NotificationType } from '@prisma/client';

/**
 * Per-event payload shapes. Every job lands in BullMQ as a NotifyJob with
 * `type` + `payload`; here we declare the typed shape per event so the worker
 * + template engine + webhook signer all agree on field names.
 */

export interface AssetRef {
  assetId: string;
  assetSlug: string;
  assetTitle: string;
}

export interface UserRef {
  id: string;
  email?: string;
  displayName: string;
}

export interface CommentCreatedPayload extends AssetRef {
  commentId: string;
  commentExcerpt: string;
  author: UserRef;
}

export interface CommentReplyPayload extends CommentCreatedPayload {
  parentCommentId: string;
}

export interface IssueCreatedPayload extends AssetRef {
  commentId: string;
  commentExcerpt: string;
  author: UserRef;
}

export interface IssueStatusChangedPayload extends AssetRef {
  commentId: string;
  newStatus: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';
  changedBy: UserRef;
}

export interface RequestCreatedPayload {
  requestId: string;
  requester: UserRef;
  assetLink: string;
  assetType: string;
  intendedUse: string;
}

export interface RequestStatusChangedPayload {
  requestId: string;
  newStatus: 'SENT' | 'IN_REVIEW' | 'PENDING' | 'APPROVED' | 'REJECTED';
  adminComment?: string;
}

export interface ReportCreatedPayload extends AssetRef {
  reportId: string;
  category: 'MALICIOUS_FILE' | 'BROKEN_ASSET';
  reporter: UserRef;
}

export interface ReportReceivedForYourAssetPayload extends AssetRef {
  reportId: string;
  category: 'MALICIOUS_FILE' | 'BROKEN_ASSET';
}

export interface FeaturedFeaturedPayload extends AssetRef {
  featuredAt: string;
}

export interface VersionPublishedPayload extends AssetRef {
  versionId: string;
  semver: string;
}

export interface AnalyzerFailedPayload extends AssetRef {
  versionId: string;
  reason: string;
}

/** Discriminated union — events index by NotificationType. */
export type NotificationPayloadMap = {
  [NotificationType.COMMENT_CREATED]: CommentCreatedPayload;
  [NotificationType.COMMENT_REPLY]: CommentReplyPayload;
  [NotificationType.ISSUE_CREATED]: IssueCreatedPayload;
  [NotificationType.ISSUE_STATUS_CHANGED]: IssueStatusChangedPayload;
  [NotificationType.REQUEST_CREATED]: RequestCreatedPayload;
  [NotificationType.REQUEST_STATUS_CHANGED]: RequestStatusChangedPayload;
  [NotificationType.REPORT_CREATED]: ReportCreatedPayload;
  [NotificationType.REPORT_RECEIVED_FOR_YOUR_ASSET]: ReportReceivedForYourAssetPayload;
  [NotificationType.FEATURED_FEATURED]: FeaturedFeaturedPayload;
  [NotificationType.VERSION_PUBLISHED]: VersionPublishedPayload;
  [NotificationType.ANALYZER_FAILED]: AnalyzerFailedPayload;
};

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

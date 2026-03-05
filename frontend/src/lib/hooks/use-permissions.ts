'use client';

import { useMemo } from 'react';
import type { AssetDetail, AssetStatus, CommentNode, MeResponse } from '@/lib/api/types';

interface PermissionContext {
  me?: Pick<MeResponse, 'id' | 'isAdmin' | 'role'> | null;
  asset?: Pick<
    AssetDetail,
    'status' | 'owner' | 'canEdit' | 'canDelete' | 'canArchive'
  > | null;
  comment?: Pick<CommentNode, 'author' | 'kind'>;
}

export interface Permissions {
  canSave: boolean;
  canReport: boolean;
  canEditAsset: boolean;
  canNewVersion: boolean;
  canArchiveAsset: boolean;
  canRestoreAsset: boolean;
  canDeleteAsset: boolean;
  canComment: boolean;
  canReply: boolean;
  canEditOwnComment: boolean;
  canDeleteAnyComment: boolean;
  canChangeIssueStatus: boolean;
  canViewAnalytics: boolean;
  canAccessAdmin: boolean;
}

const DEFAULT: Permissions = {
  canSave: false,
  canReport: false,
  canEditAsset: false,
  canNewVersion: false,
  canArchiveAsset: false,
  canRestoreAsset: false,
  canDeleteAsset: false,
  canComment: false,
  canReply: false,
  canEditOwnComment: false,
  canDeleteAnyComment: false,
  canChangeIssueStatus: false,
  canViewAnalytics: false,
  canAccessAdmin: false,
};

/**
 * Single source of truth for client-side action visibility. The backend still
 * enforces. Hiding controls here is a UX nicety, not a security boundary.
 */
export function usePermissions(ctx: PermissionContext): Permissions {
  return useMemo(() => {
    const me = ctx.me;

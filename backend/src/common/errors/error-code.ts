/**
 * Stable error codes that the frontend / plugins switch on. These are part of
 * the public API contract — never rename, only add.
 */
export const ErrorCode = {
  AUTH_UNAUTHENTICATED: 'auth.unauthenticated',
  AUTH_FORBIDDEN: 'auth.forbidden',
  AUTH_PLUGIN_TOKEN_INVALID: 'auth.plugin_token_invalid',

  ASSET_NOT_FOUND: 'asset.not_found',
  ASSET_PUBLISH_BLOCKED: 'asset.publish_blocked',
  ASSET_ARCHIVE_BLOCKED: 'asset.archive_blocked',
  ASSET_CANNOT_CHANGE_ENGINE: 'asset.cannot_change_engine',
  ASSET_SLUG_TAKEN: 'asset.slug_taken',

  VERSION_NOT_FOUND: 'version.not_found',
  VERSION_SEMVER_INVALID: 'version.semver_invalid',
  VERSION_DUPLICATE: 'version.duplicate',
  VERSION_NOT_LATEST_PUBLISH_FIRST: 'version.not_latest_publish_first',
  VERSION_CANNOT_CHANGE_SEMVER: 'version.cannot_change_semver',

  FILE_UPLOAD_INIT_FAILED: 'file.upload_init_failed',
  FILE_UPLOAD_NOT_FOUND: 'file.upload_not_found',

  LIBRARY_DUPLICATE: 'library.duplicate',

  COMMENT_NOT_FOUND: 'comment.not_found',
  COMMENT_DEPTH_EXCEEDED: 'comment.depth_exceeded',
  COMMENT_LITE_TIPTAP_VIOLATION: 'comment.lite_tiptap_violation',
  COMMENT_LONG_TIPTAP_VIOLATION: 'comment.long_tiptap_violation',

  REQUEST_NOT_FOUND: 'request.not_found',
  REQUEST_DUPLICATE_LINK: 'request.duplicate_link',

  CATEGORY_NOT_FOUND: 'category.not_found',
  LICENSE_NOT_FOUND: 'license.not_found',
  USER_NOT_FOUND: 'user.not_found',

  IDEMPOTENCY_KEY_REUSED: 'idempotency.key_reused_different_body',

  CONFIRMATION_REQUIRED: 'confirmation.required',
  CONFIRMATION_EXPIRED: 'confirmation.expired',
  RATE_LIMIT_EXCEEDED: 'rate_limit.exceeded',

  ADMIN_CANNOT_REMOVE_LAST_ADMIN: 'admin.cannot_remove_last_admin',
  ADMIN_CANNOT_DEMOTE_BOOTSTRAP: 'admin.cannot_demote_bootstrap',

  CATEGORY_IN_USE: 'category.in_use',
  LICENSE_IN_USE: 'license.in_use',
  TAG_IN_USE: 'tag.in_use',
  FEATURED_ACTIVE_CAP_REACHED: 'featured.active_cap_reached',
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

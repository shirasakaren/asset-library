/**
 * Record types for the preview seed data (`src/preview/seed-data/<collection>.json`).
 *
 * This file is the contract between the seed generator (`scripts/seed/build-seed.ts`)
 * and the mock-API handlers (`src/preview/handlers/**`). Read it before writing a
 * handler.
 *
 * ## Principles
 *
 * 1. Every record has `id: string` (so it satisfies `Doc` and can live in the `Db`).
 * 2. Records hold normalized foreign keys (`ownerId`, `categoryId`, ...) and only
 *    stored facts. API payloads (`AssetSummary`, `AssetDetail`, `CommentNode`,
 *    `DiscoverResponse`, `DashboardResponse`, `AdminStorageUserRow`, ...) are
 *    DERIVED by the handlers at read time. Each interface below says which
 *    endpoints consume it and which response fields the handler must compute.
 * 3. Counters that must stay consistent are stored as base numbers (see
 *    `AssetRecord.totalSaves`) and adjusted by the handler that changes them.
 * 4. All timestamps are ISO-8601 UTC strings. The seed is generated relative to a
 *    fixed anchor, `2026-10-01T00:00:00Z` (see `KvMetaValue.anchor`); nothing in
 *    the seed depends on the wall clock.
 * 5. Arrays in a seed file are in generation order, NOT API order: handlers must
 *    sort (with an `id` tiebreak) and paginate themselves.
 *
 * ## ID scheme (all ids are human-readable and stable across rebuilds)
 *
 * | collection    | id                                   | example                          |
 * | ------------- | ------------------------------------ | -------------------------------- |
 * | users         | `u-persona` or `u-<first>-<last>`    | `u-persona`, `u-kenji-matsuda`   |
 * | categories    | `cat-<slug>`                         | `cat-3d-models`                  |
 * | licenses      | `lic-<slug>`                         | `lic-cc-by`                      |
 * | tags          | `tag-<slug>`                         | `tag-low-poly`                   |
 * | assets        | `a-<slug>` (slug from assets.yaml)   | `a-ultimate-prop-pack`           |
 * | versions      | `v-<slug>-<major>-<minor>-<patch>`   | `v-ultimate-prop-pack-1-1-0`     |
 * | files         | `f-<slug>-<major>-<minor>-<patch>`   | `f-ultimate-prop-pack-1-1-0`     |
 * | preview media | `pm-<slug>-1`                        |                                  |
 * | comments      | `c-0001` ...                         |                                  |
 * | notifications | `n-01` ...                           |                                  |
 * | requests      | `req-01` ...                         |                                  |
 * | reports       | `rep-01` ...                         |                                  |
 * | audit         | `au-001` ...                         |                                  |
 * | featured      | `fs-1` ... `fs-5`                    |                                  |
 * | devices       | `dev-1`, `dev-2`                     |                                  |
 * | webhooks      | `wh-01` ...                          |                                  |
 * | storage       | `st-user-<userId>`, `st-asset-<assetId>`, `st-bucket-<bucket>` |        |
 * | analytics     | `an-<assetId>`, `an-platform`        |                                  |
 * | library       | the saved asset's id (`a-...`)       |                                  |
 * | kv            | `meta`                               |                                  |
 *
 * Handlers creating new records at runtime should use ids that cannot collide with
 * the above (for example `<prefix>-<uuid>` or a `new-` infix).
 */
import type {
  AssetDetail,
  AssetFile,
  AssetRequest,
  AssetVersionPayload,
  CommentKind,
  IssueStatus,
  LocaleCode,
  NotificationItem,
  NotificationType,
  ServerAvatar,
  TipTapDoc,
} from '@/lib/api/types';
import type {
  AdminFeaturedSlot,
  AdminWebhookDelivery,
  AuditEntry,
  ReportAction,
  ReportCategory,
  ReportStatus,
} from '@/lib/api/admin-types';
import type { Doc } from './types';

/** `{ en, id }` pair used for every localized stored text. `id` is Indonesian. */
export type I18n = Record<LocaleCode, string>;

/* ========================================================================== *
 * users.json
 * ========================================================================== */

/**
 * A person. Persona (the signed-in demo visitor) is `u-persona`, "Aria Wijaya".
 *
 * Consumed by: `GET /auth/me`, `GET /me`, `GET /users/{id}`, `GET /users/search`,
 * `GET /admin/users`, `GET /admin/users/{id}`, `POST /admin/users/{id}/promote|demote`,
 * and every handler that embeds an owner/author/requester `{ id, displayName, avatar }`.
 *
 * Derived at read time:
 *  - `MeResponse.hasPublishedAssets`: the user owns at least one PUBLISHED asset.
 *  - `MeResponse.unreadNotifications`: count of `NotificationRecord`s with `readAt === null`
 *    (only the persona has notifications).
 *  - `AdminUser.publishedAssetCount`: PUBLISHED assets whose `ownerId` is this user.
 *  - `AdminUser.savedBytes`: optional, may be omitted.
 *  - `UserPublicProfile.joinedAt` = `createdAt`.
 * Invariant: `isAdmin === (role === 'admin')`. Promote/demote must keep them in sync.
 * Admins in the seed: `u-persona`, `u-kenji-matsuda`, `u-siti-rahmawati`.
 */
export interface UserRecord extends Doc {
  id: string;
  email: string;
  displayName: string;
  role: 'admin' | 'contributor' | 'user';
  avatar: ServerAvatar;
  createdAt: string;
  locale: LocaleCode;
  isAdmin: boolean;
}

/* ========================================================================== *
 * categories.json / licenses.json / tags.json
 * ========================================================================== */

/**
 * One of the 10 backend categories (EN + ID names from `backend/scripts/seed.ts`).
 *
 * Consumed by: `GET /categories`, `GET /discover`, `GET /admin/categories` (+ CRUD,
 * reorder), asset filters, publish wizard.
 * Derived: `Category.name` (pick `name[locale]`), `Category.assetCount` and
 * `AdminCategory.assetCount` (count PUBLISHED assets for the public list, all
 * non-deleted for admin), `AdminCategory.iconUrl` (always `null`; `iconKey` is a
 * decorative name only).
 */
export interface CategoryRecord extends Doc {
  id: string;
  slug: string;
  name: I18n;
  iconKey: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * One of the 7 backend licenses, including `fullText`.
 *
 * Consumed by: `GET /licenses`, `GET /licenses/{id}`, `GET /admin/licenses` (+ CRUD).
 * Derived: `LicenseSummary.name` is not localized (as in the backend);
 * `LicenseSummary.description` = `description[locale]`; `AdminLicense.assetCount` =
 * number of assets whose `licenseId` is this license.
 * Note: the curated assets only use `lic-commercial`, `lic-cc-by`, `lic-cc0`
 * and `lic-mit`; the other three exist so the admin screens have realistic data.
 */
export interface LicenseRecord extends Doc {
  id: string;
  slug: string;
  name: string;
  description: I18n;
  fullText: I18n;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * A tag. `slug` is lowercase ASCII (`c++` is stored as `cpp`).
 *
 * Consumed by: `GET /tags`, `GET /search/tags`, `GET /admin/tags` (+ merge/patch/delete),
 * asset filters and `AssetDetail.tags`.
 * `usageCount` = number of assets (any status; the seed has no DELETED ones) whose
 * `tagIds` contains this tag. It is a stored counter: tag merge sums it, asset
 * create/delete adjusts it. `createdAt` = creation time of the oldest asset using it.
 */
export interface TagRecord extends Doc {
  id: string;
  slug: string;
  displayName: string;
  usageCount: number;
  createdAt: string;
}

/* ========================================================================== *
 * assets.json
 * ========================================================================== */

/**
 * AV scan state of a version. The API (`AssetVersionPayload`) has no such field, so
 * it lives on the stored version record. `INFECTED` versions feed the admin AV
 * queue (`/admin/av/*`) and `DashboardCounts.avInfected`, and downloading one must
 * fail with the `av.infected` problem code. `SKIPPED_SIZE` is never seeded.
 */
export type AvStatus = 'CLEAN' | 'INFECTED' | 'SKIPPED_SIZE';

/**
 * The single placeholder file of a version: a `.txt` link file named
 * `<slug>-<semver>.txt`, `kind: 'OTHER'`.
 *
 * `bytes` is the UTF-8 byte length of `meta.content` (as a decimal string, like the
 * API). `meta.content` is exactly what the download handler must put in the Blob:
 * `"Original asset page:\n<storeUrl>\n"`. Everything else is already in API shape,
 * so `AssetFile` can be returned as is (including `meta`).
 */
export interface AssetFileRecord extends AssetFile {
  meta: { content: string };
}

/**
 * A stored version, embedded in `AssetRecord.versions` (oldest first). Everything
 * of `AssetVersionPayload` is stored verbatim, so `AssetDetail.versions` can be the
 * array as is (strip `avStatus`/`avAcknowledgedAt` if you want strict payloads).
 *
 * Extra stored facts:
 *  - `createdAt`: for `VersionSummary.createdAt` (`GET /assets/{id}/versions`).
 *  - `releaseNotes` is a locale map `{ en?, id? }` of TipTap docs (`ReleaseNotes`), never a bare
 *    document; the seed only has `en`. Handlers still adapt a bare doc on read
 *    (`normalizeReleaseNotes`), for overlay data written by older code.
 *  - `avStatus`: see {@link AvStatus}. Exactly one version in the seed is `INFECTED`
 *    (a non-latest version of a published asset owned by someone other than the persona).
 *  - `avAcknowledgedAt`: set when an admin acknowledges an infected version in the AV queue.
 *
 * Invariants: exactly one version per asset has `isLatest: true` (the newest one;
 * for DRAFT assets the single version has `publishedAt: null`). `bytesTotal` is the
 * sum of file bytes and `fileCount === files.length`. `analysisStatus` is `READY`
 * for every seeded version.
 */
export interface AssetVersionRecord extends AssetVersionPayload {
  files: AssetFileRecord[];
  createdAt: string;
  avStatus: AvStatus;
  avAcknowledgedAt: string | null;
}

/**
 * A catalog asset: 151 real store listings from `scripts/seed/assets.yaml`.
 *
 * Consumed by: `GET /assets`, `GET /assets/{idOrSlug}`, `/assets/{id}/recommended`,
 * `GET /discover`, `/search/*`, `GET /library`, `/me/analytics/*`, publish/version/
 * upload/download handlers, and all `/admin/assets*` + moderation routes.
 *
 * `AssetDetail` fields that the handler must DERIVE (they are NOT stored):
 *  - `category` `{ id, slug, name }` from `categoryId` (+ locale), `license` `{ id, slug, name }`
 *    from `licenseId`, `tags` `[{ id, slug, displayName }]` from `tagIds`,
 *    `owner` `{ id, displayName, avatar }` from `ownerId`.
 *  - `isSaved`: asset id is in the `library` collection.
 *  - `canEdit` / `canDelete` / `canArchive`: persona is the owner or an admin
 *    (archive only while PUBLISHED; restore while ARCHIVED).
 *  - `AssetSummary`: `ownerDisplayName`, `categoryName`, `thumbnailUrl` (= `thumbnail.url`
 *    for the card; `thumbnailSmall` is the 320x200 variant for dense lists).
 *  - `AdminAssetRow.ownerEmail`, `SearchAssetHit.ownerName`, `FeaturedSlot.assetSlug`, ...
 *
 * Localized text. `title`/`shortDescription` are the English base strings (what the
 * API returns when the request has no locale); handlers should prefer
 * `titleI18n[locale]` / `shortDescriptionI18n[locale]` when present.
 *  - `shortDescriptionI18n.en` = `short` and `.id` = `short_id` from assets.yaml.
 *  - `titleI18n.en` = `titleI18n.id` = the English title: product names are not
 *    translated into Indonesian. For the 6 listings whose store title is Japanese,
 *    the English title is a hand-written translation and the original is kept in
 *    `originalTitle` (also quoted in `longDescription`). Never use `originalTitle`
 *    as the display title.
 *  - `longDescription` and release notes are English only; `availableLocales` is
 *    `['en', 'id']` because titles and short descriptions exist in both.
 *
 * Counters (stored, handler-adjusted):
 *  - `totalDownloads`: base counter; `POST /downloads` increments it (overlay write).
 *  - `totalSaves`: INCLUDES the persona's own save. Invariant at seed time:
 *    `totalSaves = (saves by other users) + (asset in persona library ? 1 : 0)`, so it is
 *    always >= 1 for library items. Save/unsave handlers do `+1`/`-1`; never recompute it
 *    from the library alone.
 *  - `viewCount`: page views (not exposed by `AssetDetail`; for analytics only).
 *
 * Thumbnails: real, bundled store art. `thumbnail.url` is `/thumbs/<slug>.webp`
 * (640x400), `thumbnailSmall` is `/thumbs/<slug>-sm.webp` (320x200); `thumbnail.key` is
 * `thumbs/<slug>.webp`. Both resolve against the site root (honour
 * `NEXT_PUBLIC_BASE_PATH` when turning them into `<img src>`). `thumbnailAutoGenerated`
 * is always `null`. The stored `previewMedia` has exactly one `image` item (the thumbnail), but
 * `AssetDetail.previewMedia` leaves the cover out: the detail page prepends `thumbnail` to the
 * gallery itself, so `toDetail` filters items whose `viewUrl`/`key` equal the thumbnail.
 *
 * `storeName` / `storeUrl` point at the original listing ("View on <Store>"); `storeUrl`
 * is always https. Records created at runtime by the publish wizard have no store: use
 * `storeName: ''`, `storeUrl: ''`.
 *
 * Status mix in the seed: PUBLISHED (>=10 in every category), DRAFT (`publishedAt: null`),
 * ARCHIVED. There are no DELETED assets; the delete handler sets `status: 'DELETED'` and
 * every list must exclude them.
 */
export interface AssetRecord
  extends
    Omit<
      AssetDetail,
      | 'category'
      | 'license'
      | 'tags'
      | 'owner'
      | 'versions'
      | 'isSaved'
      | 'canEdit'
      | 'canDelete'
      | 'canArchive'
    >,
    Doc {
  id: string;
  ownerId: string;
  categoryId: string;
  licenseId: string;
  tagIds: string[];
  titleI18n: I18n;
  shortDescriptionI18n: I18n;
  /** Original (non-English) store title, only for the 6 Japanese-titled listings. */
  originalTitle?: string;
  thumbnailSmall: string | null;
  storeName: string;
  storeUrl: string;
  viewCount: number;
  versions: AssetVersionRecord[];
}

/* ========================================================================== *
 * comments.json
 * ========================================================================== */

/**
 * A comment or issue on a PUBLISHED asset. Threads are stored flat; the handler
 * builds the `CommentNode` tree.
 *
 * Consumed by: `GET/POST /assets/{assetId}/comments`, `PATCH/DELETE /comments/{id}`,
 * `PATCH /comments/{id}/status`, notification payloads.
 *
 * Derived: `CommentNode.author` `{ id, displayName, avatar }` from `authorId`;
 * `CommentNode.status` = `issueStatus`; `replies` = children by `parentId`; `body` = `body`.
 *
 * Rules the seed follows (and handlers must keep):
 *  - `depth` is 0 for top-level comments and `parent.depth + 1` for replies. The
 *    backend allows at most 5 levels, so the max stored `depth` is 4 and creating a
 *    reply whose parent has `depth >= 4` is a 400 (`comment.depth_exceeded`). The seed has
 *    threads that reach depth 4.
 *  - Only top-level rows (`parentId === null`) can be `kind: 'ISSUE'`; they carry
 *    `issueStatus` (`OPEN` | `ACKNOWLEDGED` | `RESOLVED`), everything else has `null`.
 *  - Soft delete: `deletedAt` is set, the row keeps its place in the tree (children
 *    stay) and `body` is already the tombstone paragraph "This comment was deleted.".
 *  - `editedAt` is non-null for edited comments, always after `createdAt`.
 */
export interface CommentRecord extends Doc {
  id: string;
  assetId: string;
  parentId: string | null;
  authorId: string;
  kind: CommentKind;
  issueStatus: IssueStatus | null;
  depth: number;
  body: TipTapDoc;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
}

/* ========================================================================== *
 * notifications.json  (the persona's inbox only)
 * ========================================================================== */

/**
 * One notification in the persona's inbox: every field of `NotificationItem`, with
 * the type narrowed. Order in the file is newest first, but sort anyway.
 *
 * Consumed by: `GET /notifications`, `GET /notifications/unread-count`,
 * `POST /notifications/{id}/read`, `POST /notifications/read-all`,
 * `MeResponse.unreadNotifications`.
 *
 * `payload` keys the UI reads (see `notification-row.tsx` / `notification-icon.tsx`):
 * `assetId`, `assetSlug`, `assetTitle`, `commentId`, `authorDisplayName`,
 * `requesterName`, `status`, `category`, `semver`, `versionLabel`, `ownerName`,
 * `byAdminName`. The seed fills the ones that make sense for each type, with ids
 * that resolve to real records. Unread = `readAt === null`.
 */
export interface NotificationRecord extends Doc, NotificationItem {
  id: string;
  type: NotificationType;
}

/* ========================================================================== *
 * requests.json / reports.json
 * ========================================================================== */

/**
 * A request for an asset to be added (`AssetRequest` + admin bookkeeping).
 *
 * Consumed by: `GET/POST /asset-requests`, `GET /asset-requests/{id}`,
 * `GET /admin/asset-requests`, `GET/PATCH /admin/asset-requests/{id}`, dashboard
 * `pendingRequests` (status `SENT`, `IN_REVIEW` or `PENDING`).
 * Derived: `AssetRequest.requester` `{ id, displayName }` from `requesterId`.
 * The persona has two requests: one `PENDING`, one `APPROVED` (with `adminComment`).
 * Every `AssetRequestStatus` appears at least once. `adminComment` is set for
 * `APPROVED`/`REJECTED`, and `reviewedById` is the admin who last changed the status.
 */
export interface RequestRecord extends Doc, Omit<AssetRequest, 'requester'> {
  id: string;
  requesterId: string;
  reviewedById: string | null;
}

/**
 * An asset report (admin shape `AdminReport` minus the derived fields).
 *
 * Consumed by: `POST /reports`, `GET /admin/reports`, `GET /admin/reports/{id}`,
 * `POST /admin/reports/{id}/start-review|dismiss|action`, dashboard `pendingReports`
 * (status `OPEN` or `REVIEWING`).
 * Derived: `assetTitle` / `assetSlug` from `assetId`; `reporter` `{ id, displayName,
 * email }` from `reporterId`. Every `ReportStatus` appears. `ACTIONED` rows carry the
 * `action` that was taken; `resolvedAt` is set for `ACTIONED`/`DISMISSED` only.
 */
export interface ReportRecord extends Doc {
  id: string;
  category: ReportCategory;
  notes: string;
  status: ReportStatus;
  assetId: string;
  reporterId: string;
  adminNotes: string | null;
  action: ReportAction | null;
  resolvedById: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

/* ========================================================================== *
 * library.json / featured.json / devices.json
 * ========================================================================== */

/**
 * A saved asset in the persona's library. `id` IS the asset id (so save is a
 * `put`, unsave is a `remove`, and a duplicate save is impossible).
 *
 * Consumed by: `GET /library` (`LibraryItem` = `{ addedAt, hidden, asset: <summary> }`),
 * `POST /library/items`, `PATCH|DELETE /library/items/{assetId}`, and `AssetDetail.isSaved`.
 * The seed only has PUBLISHED assets here. Hidden items are excluded from the default
 * library listing (`hidden=false`).
 */
export interface LibraryRecord extends Doc {
  id: string;
  addedAt: string;
  hidden: boolean;
}

/**
 * A featured slot (admin shape stored whole; `AdminFeaturedSlot` minus the derived
 * `assetTitle` / `assetSlug`).
 *
 * Consumed by: `GET /discover` (`FeaturedSlot`, active slots by `sortOrder`),
 * `GET/POST/PATCH/DELETE /admin/featured*`, `POST /admin/featured/reorder`.
 * Derived: `FeaturedSlot.title` = `customTitle ?? asset.title`;
 * `FeaturedSlot.shortDescription` = `customShortDescription?.[locale] ?? asset short
 * description`; `FeaturedSlot.bannerUrl` = `customBannerUrl ?? asset.thumbnail.url`;
 * `assetSlug`/`assetTitle` from the asset. The seed has 5 slots (the cap), all
 * active, `sortOrder` 1..5, whose banner URL is the asset's thumbnail.
 */
export interface FeaturedRecord extends Doc, Omit<AdminFeaturedSlot, 'assetTitle' | 'assetSlug'> {
  id: string;
}

/**
 * A registered plugin device of the persona (`PluginDevice` in `profile-surface.tsx`
 * is `{ id, deviceLabel, createdAt, lastUsedAt, expiresAt }`).
 *
 * Consumed by: `GET /auth/plugin/devices` (list only rows with `revokedAt === null`),
 * `DELETE /auth/plugin/devices/{id}` and `POST /me/devices/{id}/revoke` (set `revokedAt`).
 * Seed: `dev-1` active, `dev-2` revoked.
 */
export interface DeviceRecord extends Doc {
  id: string;
  userId: string;
  deviceLabel: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string;
  revokedAt: string | null;
}

/* ========================================================================== *
 * audit.json / webhooks.json
 * ========================================================================== */

/**
 * An audit-log row: `AuditEntry` minus the derived actor columns.
 *
 * Consumed by: `GET /admin/audit` (filters: `actorId`, `action`, `subjectType`,
 * `subjectId`, `from`, `to`), `GET /admin/audit/{id}`, `DashboardResponse.recentAudit`.
 * Derived: `actorDisplayName` / `actorEmail` from `actorId` (`null` actor = system job).
 * Every mutating admin handler must append one (`id` unique, `createdAt` = now).
 * `action` names are the backend ones (`asset.admin_archive`, `report.dismiss`, `tag.merge`,
 * `user.promote`, `featured.reorder`, `me.revoke_device`, ...); `subjectType` is one of
 * `Asset`, `User`, `Tag`, `Category`, `License`, `FeaturedSlot`, `Report`, `AssetRequest`,
 * `Device`. All seeded entries fall within the 30 days before the anchor (retention window).
 */
export interface AuditRecord extends Doc, Omit<AuditEntry, 'actorDisplayName' | 'actorEmail'> {
  id: string;
}

/**
 * A webhook delivery attempt, stored in full (`AdminWebhookDelivery` as is).
 *
 * Consumed by: `GET /admin/webhook-deliveries` only. 30 rows: mostly `success`,
 * some `failure` (5xx or `responseStatus: null` with a timeout excerpt), one `pending`.
 */
export interface WebhookDeliveryRecord extends Doc, AdminWebhookDelivery {
  id: string;
}

/* ========================================================================== *
 * storage.json / analytics.json / kv.json
 * ========================================================================== */

/**
 * Storage rollups for the admin storage screens and dashboard.
 *
 * IMPORTANT: byte values are SIMULATED "as if the original files were hosted"
 * (megabytes per asset, by category). They deliberately do not match the real size of
 * the `.txt` link files in `AssetFileRecord`. They ARE consistent with each other:
 * a user's `bytes` is the sum of that user's assets' `bytes`, and each user's `spark`
 * is the element-wise sum of the user's asset sparks; the `source` bucket is the sum of
 * all asset bytes.
 *
 * `spark` has 30 daily values, oldest first, the last one being `asOfDate`; the
 * handler maps it to `{ date, bytes }[]` (`date = asOfDate - (29 - index) days`).
 * Assets that did not exist yet on a day contribute 0.
 *
 * Consumed by:
 *  - `kind: 'user'`: `GET /admin/storage/users` -> `AdminStorageUserRow`
 *    (`userId = refId`, `displayName`/`email` from the user, `bytes`, `spark`).
 *  - `kind: 'asset'`: `GET /admin/storage/assets` -> `AdminStorageAssetRow`
 *    (`assetId = refId`, `slug`/`title`/`ownerDisplayName` from the asset).
 *  - `kind: 'bucket'`: `DashboardResponse.storage.byBucket` (`bucket`, `bytes`) and
 *    `AdminStorageSummary` (`totalBytes` = sum of all bucket rows, `asOfDate`). Buckets:
 *    `source`, `derived`, `thumbs`, `featured`, `editor`.
 * Only DRAFT/PUBLISHED/ARCHIVED assets and their owners have rows.
 */
export type StorageRecord = StorageUserRecord | StorageAssetRecord | StorageBucketRecord;

export interface StorageUserRecord extends Doc {
  id: string;
  kind: 'user';
  refId: string;
  bytes: number;
  spark: number[];
  asOfDate: string;
}

export interface StorageAssetRecord extends Doc {
  id: string;
  kind: 'asset';
  refId: string;
  bytes: number;
  spark: number[];
  asOfDate: string;
}

export interface StorageBucketRecord extends Doc {
  id: string;
  kind: 'bucket';
  bucket: 'source' | 'derived' | 'thumbs' | 'featured' | 'editor';
  bytes: number;
  asOfDate: string;
}

/**
 * Analytics, one record per published asset plus one platform record.
 *
 * Daily arrays are oldest first and END on `endDate` (the day before the anchor, so
 * `2026-09-30`): `date = endDate - (length - 1 - index) days`. They hold 90 values; the
 * 30-day charts use the last 30. Handlers must NOT shift them to "today" unless they
 * shift every date consistently.
 *
 * `kind: 'asset'` (`id: an-<assetId>`): for EVERY published asset.
 *  - `downloads7d`, `downloads30d`: downloads in the last 7/30 days up to `endDate`
 *    (dashboard `topAssets7d`, `totals.downloads30d`, `/admin/analytics/assets`).
 *  - `detail`: only for assets owned by the persona (else `null`). Backs
 *    `GET /me/analytics/assets/{assetId}` (`AssetAnalyticsDetail`: `daily` = `{ date, count }`
 *    from `detail.daily`; `byCountry`, `bySource` as is; `byVersion`/`byFile` with `semver` /
 *    `relativePath` filled in from the asset). All of `detail.daily`, `byCountry`,
 *    `bySource`, `byVersion` and `byFile` sum to the same number (downloads in the 90-day
 *    window, always <= the asset's `totalDownloads`).
 *  - `GET /me/analytics/summary` is computed from the persona's `detail` series
 *    (`totals.downloads30d`/`downloads7d`, `daily90d` = per-day sum over the persona's
 *    assets) plus the assets' `totalDownloads` / `totalSaves`.
 *  - DRAFT and ARCHIVED assets have NO `AnalyticsRecord` (they have no downloads in the
 *    window). `GET /me/analytics/assets/{id}` for such an asset (or for a published asset of
 *    someone else) must still answer for the owner/admin with an EMPTY detail: `daily` of
 *    zeros, empty `byCountry`/`bySource`, `byVersion`/`byFile` with zero downloads for each
 *    stored version/file. Assets created at runtime start the same way.
 *  - `DashboardResponse.topAssets7d[].saves` has no 7-day series behind it: use the asset's
 *    `totalSaves`; `downloads` comes from `downloads7d`.
 *
 * `kind: 'platform'` (`id: an-platform`): `downloads` = platform-wide downloads per day
 * (the sum of the simulated per-asset daily series for all published assets, 90 values);
 * `DashboardResponse.charts.downloads30d` and `counts.downloads30d` come from its last 30
 * values. `publishes30d` and `newUsers30d` are NOT stored: derive them from
 * `AssetRecord.publishedAt` and `UserRecord.createdAt`.
 */
export type AnalyticsRecord = AssetAnalyticsRecord | PlatformAnalyticsRecord;

export interface AssetAnalyticsRecord extends Doc {
  id: string;
  kind: 'asset';
  assetId: string;
  endDate: string;
  downloads7d: number;
  downloads30d: number;
  detail: AssetAnalyticsDetailRecord | null;
}

export interface AssetAnalyticsDetailRecord {
  daily: number[];
  /** ISO 3166 country codes. */
  byCountry: Record<string, number>;
  /** `WEB` | `UNITY` | `UNREAL`. */
  bySource: Record<string, number>;
  byVersion: { versionId: string; downloads: number }[];
  byFile: { fileId: string; downloads: number }[];
}

export interface PlatformAnalyticsRecord extends Doc {
  id: string;
  kind: 'platform';
  endDate: string;
  downloads: number[];
}

/** The `meta` record's value in `kv.json`. */
export interface KvMetaValue {
  /** Id of the signed-in demo user. */
  personaId: string;
  /** Fixed generation anchor, `2026-10-01T00:00:00.000Z`. */
  anchor: string;
  /** Equals `SEED_VERSION` in `store/version.ts`. */
  seedVersion: string;
  /** Number of assets in the seed, handy for sanity checks. */
  assetCount: number;
}

/**
 * Generic key-value record. `kv.json` currently holds one record, `meta`
 * (`value: KvMetaValue`). Handlers may add their own keys (overlay-only).
 */
export interface KvRecord extends Doc {
  id: string;
  value: unknown;
}

export interface KvMetaRecord extends KvRecord {
  id: 'meta';
  value: KvMetaValue;
}

/** Maps each `CollectionName` to the record type stored in its seed file. */
export interface SeedCollections {
  assets: AssetRecord;
  users: UserRecord;
  categories: CategoryRecord;
  tags: TagRecord;
  licenses: LicenseRecord;
  comments: CommentRecord;
  notifications: NotificationRecord;
  requests: RequestRecord;
  reports: ReportRecord;
  library: LibraryRecord;
  audit: AuditRecord;
  featured: FeaturedRecord;
  devices: DeviceRecord;
  webhooks: WebhookDeliveryRecord;
  storage: StorageRecord;
  analytics: AnalyticsRecord;
  kv: KvRecord;
}

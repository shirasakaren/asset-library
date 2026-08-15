/**
 * Admin-only API surfaces. Kept separate from the user-facing types so
 * codegen replacements don't bleed.
 */
import type {
  AssetStatus,
  Engine,
  LocaleCode,
  PageInfo,
  ServerAvatar,
  AssetRequest,
  AssetRequestStatus,
  TipTapDoc,
} from './types';

export interface DashboardCounts {
  users: number;
  publishedAssets: number;
  draftAssets: number;
  archivedAssets: number;
  downloads30d: number;
  pendingReports: number;
  pendingRequests: number;
  avInfected: number;
}

export interface DashboardChartSeries {
  date: string;
  count: number;
}

export interface DashboardResponse {
  counts: DashboardCounts;
  storage: {
    totalBytes: number;
    byBucket: { bucket: string; bytes: number }[];
  };
  charts: {
    downloads30d: DashboardChartSeries[];
    publishes30d: DashboardChartSeries[];
    newUsers30d: DashboardChartSeries[];
  };
  topAssets7d: {
    id: string;
    slug: string;
    title: string;
    ownerDisplayName: string;
    downloads: number;
    saves: number;
  }[];
  recentAudit: AuditEntry[];
}

export interface AuditEntry {
  id: string;
  action: string;
  subjectType: string;
  subjectId: string;
  actorId: string | null;
  actorDisplayName: string | null;
  actorEmail: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface AdminAssetRow {
  id: string;
  slug: string;
  title: string;
  ownerId: string;
  ownerDisplayName: string;
  ownerEmail?: string;
  engine: Engine;
  status: AssetStatus;
  thumbnailUrl: string | null;
  categoryName: string;
  totalDownloads: number;
  totalSaves: number;
  updatedAt: string;
  publishedAt: string | null;
}

export interface AdminAssetListPage {
  items: AdminAssetRow[];
  pageInfo: PageInfo;
  counts: Record<AssetStatus, number>;
}

export interface AdminFeaturedSlot {
  id: string;
  assetId: string;
  assetTitle: string;
  assetSlug: string;
  customBannerKey: string | null;
  customBannerUrl: string | null;
  customTitle: string | null;
  customShortDescription: Record<LocaleCode, string> | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdminCategory {
  id: string;
  slug: string;
  name: Record<LocaleCode, string>;
  iconKey: string | null;
  iconUrl: string | null;
  sortOrder: number;
  isActive: boolean;
  assetCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminTagRow {
  id: string;
  slug: string;
  displayName: string;
  usageCount: number;
  createdAt: string;
}

export interface AdminTagPage {
  items: AdminTagRow[];
  pageInfo: PageInfo;
}

export interface AdminLicense {
  id: string;
  slug: string;
  name: string;
  description: Record<LocaleCode, string>;
  fullText: Record<LocaleCode, string>;
  sortOrder: number;
  isActive: boolean;
  assetCount: number;
  createdAt: string;
  updatedAt: string;
}

export type ReportCategory = 'MALICIOUS_FILE' | 'BROKEN_ASSET';
export type ReportStatus = 'OPEN' | 'REVIEWING' | 'ACTIONED' | 'DISMISSED';
export type ReportAction =
  | 'NOTHING'
  | 'ARCHIVE_ASSET'
  | 'DELETE_ASSET'
  | 'FORCE_DELETE_ASSET';

export interface AdminReport {
  id: string;
  category: ReportCategory;
  notes: string;
  status: ReportStatus;
  assetId: string;
  assetTitle: string;
  assetSlug: string;
  reporter: { id: string; displayName: string; email: string | null };
  adminNotes: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface AdminReportPage {
  items: AdminReport[];
  pageInfo: PageInfo;
}

export type AdminAssetRequest = AssetRequest;

export interface AdminAssetRequestPage {
  items: AdminAssetRequest[];
  pageInfo: PageInfo;
}

export interface AdminStorageUserRow {
  userId: string;
  displayName: string;
  email: string;
  bytes: number;
  spark: { date: string; bytes: number }[];
}

export interface AdminStorageAssetRow {
  assetId: string;
  slug: string;
  title: string;
  ownerDisplayName: string;
  bytes: number;
  spark: { date: string; bytes: number }[];
}

export interface AdminStorageSummary {
  totalBytes: number;
  byBucket: { bucket: string; bytes: number }[];
  asOfDate: string;
}

export interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  isAdmin: boolean;
  locale: LocaleCode;
  createdAt: string;
  publishedAssetCount: number;
  avatar?: ServerAvatar;
  savedBytes?: number;
}

export interface AdminUserPage {
  items: AdminUser[];
  pageInfo: PageInfo;
}

export interface AdminAuditPage {
  items: AuditEntry[];
  pageInfo: PageInfo;
}

export interface AdminWebhookDelivery {
  id: string;
  type: string;
  status: 'success' | 'failure' | 'pending';
  recipient: string;
  attempt: number;
  durationMs: number | null;
  requestBody: unknown;
  responseStatus: number | null;
  responseHeaders: Record<string, string> | null;
  responseBodyExcerpt: string | null;
  createdAt: string;
}

export interface AdminWebhookPage {
  items: AdminWebhookDelivery[];
  pageInfo: PageInfo;
}

/* ------------- shared inputs ------------- */

export interface ConfirmActionPayload {
  confirm: string;
  confirmedAt: string;
}

export interface CreateFeaturedSlotInput {
  assetId: string;
  customBannerKey?: string;
  customTitle?: string;
  customShortDescription?: Partial<Record<LocaleCode, string>>;
  isActive?: boolean;
}

export interface UpdateFeaturedSlotInput {
  customBannerKey?: string | null;
  customTitle?: string | null;
  customShortDescription?: Partial<Record<LocaleCode, string>> | null;
  isActive?: boolean;
  sortOrder?: number;
}

export interface CreateCategoryInput {
  slug: string;
  name: Record<LocaleCode, string>;
  iconKey?: string;
  sortOrder?: number;
  isActive?: boolean;
}

export interface UpdateCategoryInput {
  slug?: string;
  name?: Partial<Record<LocaleCode, string>>;
  iconKey?: string | null;
  sortOrder?: number;
  isActive?: boolean;
}

export interface CreateLicenseInput {
  slug: string;
  name: string;
  description: Record<LocaleCode, string>;
  fullText: Record<LocaleCode, string>;
  sortOrder?: number;
  isActive?: boolean;
}

export interface UpdateLicenseInput {
  name?: string;
  description?: Partial<Record<LocaleCode, string>>;
  fullText?: Partial<Record<LocaleCode, string>>;
  sortOrder?: number;
  isActive?: boolean;
}

export interface MergeTagsInput {
  fromTagIds: string[];
  intoTagId: string;
}

export interface AdminUpdateAssetRequestInput {
  status: AssetRequestStatus;
  adminComment?: string;
}

export interface AdminActionReportInput {
  adminNotes: string;
  action: ReportAction;
  confirm?: string;
  confirmedAt?: string;
}

export interface AdminDismissReportInput {
  adminNotes: string;
}

export interface AdminAssetUpdateInput {
  reason: string;
}

export type _RichText = TipTapDoc;

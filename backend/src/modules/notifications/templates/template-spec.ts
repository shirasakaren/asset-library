import { NotificationType } from '@prisma/client';

export type Locale = 'en' | 'id';

export interface LocalizedString {
  en: string;
  id: string;
}

/**
 * Declarative shape of every email. Variables are referenced as `{{var}}`
 * inside any string — substitution happens at render time. Keeping every
 * event as data (rather than hand-written MJML files) makes it trivial to
 * keep en/id in sync and lets us test the *content* without parsing MJML.
 */
export interface EmailSpec {
  /** Email subject line — substituted before send. */
  subject: LocalizedString;
  /** Eyebrow line above the title (small, secondary text). */
  eyebrow: LocalizedString;
  /** Main heading, ~6–10 words. */
  title: LocalizedString;
  /** Body paragraph(s). Newlines become `<br/>`. */
  body: LocalizedString;
  /** CTA — optional. When omitted, no button is rendered. */
  cta?: {
    label: LocalizedString;
    /** `{{var}}` placeholder for the URL. */
    href: string;
  };
}

export const EMAIL_SPECS: Record<NotificationType, EmailSpec> = {
  [NotificationType.COMMENT_CREATED]: {
    subject: {
      en: '{{author.displayName}} commented on “{{assetTitle}}”',
      id: '{{author.displayName}} mengomentari “{{assetTitle}}”',
    },
    eyebrow: { en: 'New comment', id: 'Komentar baru' },
    title: { en: 'New comment on your asset', id: 'Komentar baru pada aset Anda' },
    body: {
      en: '{{author.displayName}} just left a comment on “{{assetTitle}}”:\n“{{commentExcerpt}}”',
      id: '{{author.displayName}} baru saja meninggalkan komentar pada “{{assetTitle}}”:\n“{{commentExcerpt}}”',
    },
    cta: { label: { en: 'Open comment', id: 'Buka komentar' }, href: '{{links.commentUrl}}' },
  },
  [NotificationType.COMMENT_REPLY]: {
    subject: {
      en: '{{author.displayName}} replied to your comment',
      id: '{{author.displayName}} membalas komentar Anda',
    },
    eyebrow: { en: 'New reply', id: 'Balasan baru' },
    title: { en: 'New reply to your comment', id: 'Balasan baru pada komentar Anda' },
    body: {
      en: '{{author.displayName}} replied to your comment on “{{assetTitle}}”:\n“{{commentExcerpt}}”',
      id: '{{author.displayName}} membalas komentar Anda pada “{{assetTitle}}”:\n“{{commentExcerpt}}”',
    },
    cta: { label: { en: 'Open thread', id: 'Buka utas' }, href: '{{links.commentUrl}}' },
  },
  [NotificationType.ISSUE_CREATED]: {
    subject: { en: 'New issue on “{{assetTitle}}”', id: 'Isu baru pada “{{assetTitle}}”' },
    eyebrow: { en: 'New issue', id: 'Isu baru' },
    title: { en: 'Someone opened an issue', id: 'Seseorang membuka isu' },
    body: {
      en: '{{author.displayName}} reported an issue on “{{assetTitle}}”:\n“{{commentExcerpt}}”',
      id: '{{author.displayName}} melaporkan isu pada “{{assetTitle}}”:\n“{{commentExcerpt}}”',
    },
    cta: { label: { en: 'Open issue', id: 'Buka isu' }, href: '{{links.issueUrl}}' },
  },
  [NotificationType.ISSUE_STATUS_CHANGED]: {
    subject: { en: 'Issue updated: {{newStatus}}', id: 'Isu diperbarui: {{newStatus}}' },
    eyebrow: { en: 'Status update', id: 'Pembaruan status' },
    title: { en: 'Your issue was updated', id: 'Isu Anda diperbarui' },
    body: {
      en: '{{changedBy.displayName}} marked your issue on “{{assetTitle}}” as {{newStatus}}.',
      id: '{{changedBy.displayName}} menandai isu Anda pada “{{assetTitle}}” sebagai {{newStatus}}.',
    },
    cta: { label: { en: 'Open issue', id: 'Buka isu' }, href: '{{links.issueUrl}}' },
  },
  [NotificationType.REQUEST_CREATED]: {
    subject: { en: 'New asset request', id: 'Permintaan aset baru' },
    eyebrow: { en: 'Asset request', id: 'Permintaan aset' },
    title: { en: 'A new asset request needs review', id: 'Permintaan aset baru perlu ditinjau' },
    body: {
      en: '{{requester.displayName}} requested a {{assetType}}.\nIntended use: {{intendedUse}}',
      id: '{{requester.displayName}} meminta {{assetType}}.\nTujuan penggunaan: {{intendedUse}}',
    },
    cta: {
      label: { en: 'Review in admin panel', id: 'Tinjau di panel admin' },
      href: '{{links.adminRequestUrl}}',
    },
  },
  [NotificationType.REQUEST_STATUS_CHANGED]: {
    subject: {
      en: 'Your asset request is now {{newStatus}}',
      id: 'Permintaan aset Anda kini {{newStatus}}',
    },
    eyebrow: { en: 'Request update', id: 'Pembaruan permintaan' },
    title: { en: 'Your asset request was updated', id: 'Permintaan aset Anda diperbarui' },
    body: {
      en: 'Status: {{newStatus}}.\n{{adminComment}}',
      id: 'Status: {{newStatus}}.\n{{adminComment}}',
    },
    cta: { label: { en: 'View request', id: 'Lihat permintaan' }, href: '{{links.requestUrl}}' },
  },
  [NotificationType.REPORT_CREATED]: {
    subject: { en: 'New report on “{{assetTitle}}”', id: 'Laporan baru pada “{{assetTitle}}”' },
    eyebrow: { en: 'New report', id: 'Laporan baru' },
    title: { en: 'A new report needs moderation', id: 'Laporan baru perlu moderasi' },
    body: {
      en: '{{reporter.displayName}} filed a {{category}} report on “{{assetTitle}}”.',
      id: '{{reporter.displayName}} melaporkan {{category}} pada “{{assetTitle}}”.',
    },
    cta: {
      label: { en: 'Open in moderation queue', id: 'Buka di antrean moderasi' },
      href: '{{links.adminReportUrl}}',
    },
  },
  [NotificationType.REPORT_RECEIVED_FOR_YOUR_ASSET]: {
    subject: { en: 'Your asset was reported', id: 'Aset Anda dilaporkan' },
    eyebrow: { en: 'Asset reported', id: 'Aset dilaporkan' },
    title: { en: 'Someone filed a report on your asset', id: 'Seseorang melaporkan aset Anda' },
    body: {
      en: 'A {{category}} report was filed on “{{assetTitle}}”. Admins will follow up if needed.',
      id: 'Laporan {{category}} diajukan pada “{{assetTitle}}”. Admin akan menindaklanjuti jika perlu.',
    },
    cta: { label: { en: 'Open asset', id: 'Buka aset' }, href: '{{links.assetUrl}}' },
  },
  [NotificationType.FEATURED_FEATURED]: {
    subject: { en: '“{{assetTitle}}” is featured!', id: '“{{assetTitle}}” telah ditampilkan!' },
    eyebrow: { en: "You're featured", id: 'Anda ditampilkan' },
    title: {
      en: 'Your asset is featured on the landing page',
      id: 'Aset Anda ditampilkan di halaman utama',
    },
    body: {
      en: '“{{assetTitle}}” is now in the Discover carousel.',
      id: '“{{assetTitle}}” kini ada di korsel Discover.',
    },
    cta: { label: { en: 'Open Discover', id: 'Buka Discover' }, href: '{{links.discoverUrl}}' },
  },
  [NotificationType.VERSION_PUBLISHED]: {
    subject: {
      en: '{{assetTitle}} v{{semver}} is available',
      id: '{{assetTitle}} v{{semver}} kini tersedia',
    },
    eyebrow: { en: 'New version', id: 'Versi baru' },
    title: {
      en: 'A new version of an asset you saved is live',
      id: 'Versi baru aset yang Anda simpan telah dirilis',
    },
    body: {
      en: '“{{assetTitle}}” v{{semver}} is now available in your library.',
      id: '“{{assetTitle}}” v{{semver}} kini tersedia di pustaka Anda.',
    },
    cta: { label: { en: 'Download', id: 'Unduh' }, href: '{{links.assetUrl}}' },
  },
  [NotificationType.ANALYZER_FAILED]: {
    subject: {
      en: 'Analysis failed for “{{assetTitle}}”',
      id: 'Analisis gagal untuk “{{assetTitle}}”',
    },
    eyebrow: { en: 'Action needed', id: 'Perlu tindakan' },
    title: {
      en: "We couldn't finish analyzing your upload",
      id: 'Kami tidak dapat menyelesaikan analisis unggahan Anda',
    },
    body: {
      en: 'Analysis failed: {{reason}}. You can retry from the version page.',
      id: 'Analisis gagal: {{reason}}. Anda dapat mengulang dari halaman versi.',
    },
    cta: { label: { en: 'Open version', id: 'Buka versi' }, href: '{{links.versionUrl}}' },
  },
  [NotificationType.ADMIN_PROMOTED]: {
    subject: { en: 'You have been promoted to admin', id: 'Anda telah dipromosikan sebagai admin' },
    eyebrow: { en: 'Role update', id: 'Pembaruan peran' },
    title: { en: 'You are now an admin', id: 'Anda kini adalah admin' },
    body: {
      en: 'Your account has been granted admin privileges.',
      id: 'Akun Anda telah diberikan hak akses admin.',
    },
  },
  [NotificationType.ADMIN_DEMOTED]: {
    subject: { en: 'Your admin role has been removed', id: 'Peran admin Anda telah dicabut' },
    eyebrow: { en: 'Role update', id: 'Pembaruan peran' },
    title: { en: 'Your admin role was removed', id: 'Peran admin Anda dihapus' },
    body: {
      en: 'Your admin privileges have been revoked.',
      id: 'Hak akses admin Anda telah dicabut.',
    },
  },
};

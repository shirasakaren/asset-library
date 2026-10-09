import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parse } from 'yaml';
import { LITE_ALLOWED_NODES, LITE_ALLOWED_MARKS } from '@/components/rich-text/lite-nodes';
import type { TipTapDoc, TipTapNode } from '@/lib/api/types';
import type { CollectionName } from '@/preview/types';
import type { SeedCollections } from '@/preview/records';
import { SEED_VERSION } from '@/preview/store/version';

const root = path.resolve(__dirname, '../../..');
const seedDir = path.join(root, 'src/preview/seed-data');
const publicDir = path.join(root, 'public');

const COLLECTIONS: CollectionName[] = [
  'assets',
  'users',
  'categories',
  'tags',
  'licenses',
  'comments',
  'notifications',
  'requests',
  'reports',
  'library',
  'audit',
  'featured',
  'devices',
  'webhooks',
  'storage',
  'analytics',
  'kv',
];

const read = <K extends CollectionName>(name: K): SeedCollections[K][] =>
  JSON.parse(fs.readFileSync(path.join(seedDir, `${name}.json`), 'utf8')) as SeedCollections[K][];

const PERSONA = 'u-persona';
const ANCHOR = Date.parse('2026-10-01T00:00:00Z');
const isIso = (s: unknown): boolean =>
  typeof s === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(s);

const data = {
  assets: read('assets'),
  users: read('users'),
  categories: read('categories'),
  tags: read('tags'),
  licenses: read('licenses'),
  comments: read('comments'),
  notifications: read('notifications'),
  requests: read('requests'),
  reports: read('reports'),
  library: read('library'),
  audit: read('audit'),
  featured: read('featured'),
  devices: read('devices'),
  webhooks: read('webhooks'),
  storage: read('storage'),
  analytics: read('analytics'),
  kv: read('kv'),
};
const { assets, users, categories, tags, licenses, comments } = data;
const assetById = new Map(assets.map((a) => [a.id, a]));
const userIds = new Set(users.map((u) => u.id));
const published = assets.filter((a) => a.status === 'PUBLISHED');

function checkDoc(doc: TipTapDoc, allowed: Set<string>, where: string): void {
  expect(doc.type, where).toBe('doc');
  expect(Array.isArray(doc.content) && doc.content.length > 0, `${where} content`).toBe(true);
  const walk = (n: TipTapNode) => {
    expect(allowed.has(n.type), `${where}: node type ${n.type}`).toBe(true);
    if (n.type === 'text') {
      expect(typeof n.text === 'string' && n.text.length > 0, `${where}: text`).toBe(true);
      for (const m of n.marks ?? []) {
        expect(LITE_ALLOWED_MARKS.has(m.type), `${where}: mark ${m.type}`).toBe(true);
        if (m.type === 'link') expect(String(m.attrs?.href), where).toMatch(/^https:\/\//);
      }
    } else {
      expect(n.marks, `${where}: marks only on text`).toBeUndefined();
      expect(n.text, `${where}: text only on text`).toBeUndefined();
    }
    if (n.type === 'heading') expect([1, 2, 3]).toContain(n.attrs?.level);
    if (n.type === 'bulletList' || n.type === 'orderedList') {
      expect(n.content?.length, where).toBeGreaterThan(0);
      for (const c of n.content ?? []) expect(c.type, where).toBe('listItem');
    }
    for (const c of n.content ?? []) walk(c);
  };
  for (const n of doc.content!) walk(n);
}

describe('seed files', () => {
  it('has one non-empty JSON array file per collection, every record with a string id', () => {
    for (const c of COLLECTIONS) {
      const rows = data[c] as { id?: unknown }[];
      expect(Array.isArray(rows), c).toBe(true);
      expect(rows.length, c).toBeGreaterThan(0);
      for (const r of rows) expect(typeof r.id === 'string' && r.id.length > 0, c).toBe(true);
      expect(new Set(rows.map((r) => r.id)).size, `${c} ids unique`).toBe(rows.length);
    }
  });

  it('has the meta kv record', () => {
    const meta = data.kv.find((k) => k.id === 'meta');
    expect(meta?.value).toEqual({
      personaId: PERSONA,
      anchor: '2026-10-01T00:00:00.000Z',
      seedVersion: SEED_VERSION,
      assetCount: assets.length,
    });
  });
});

describe('assets', () => {
  it('has at least 100 assets, matching assets.yaml', () => {
    expect(assets.length).toBeGreaterThanOrEqual(100);
    const yamlEntries = parse(
      fs.readFileSync(path.join(root, 'scripts/seed/assets.yaml'), 'utf8'),
    ) as { slug: string; url: string; store: string }[];
    expect(assets.map((a) => a.slug).sort()).toEqual(yamlEntries.map((e) => e.slug).sort());
    for (const e of yamlEntries) {
      const a = assetById.get(`a-${e.slug}`);
      expect(a?.storeUrl, e.slug).toBe(e.url);
      expect(a?.storeName, e.slug).toBe(e.store);
    }
  });

  it('populates all 10 categories with at least 10 published assets each', () => {
    expect(categories.length).toBe(10);
    for (const c of categories) {
      const n = published.filter((a) => a.categoryId === c.id).length;
      expect(n, c.id).toBeGreaterThanOrEqual(10);
    }
  });

  it('has a real thumbnail file and an https store link for every asset', () => {
    for (const a of assets) {
      expect(a.storeUrl, a.slug).toMatch(/^https:\/\//);
      expect(a.thumbnail.url, a.slug).toBe(`/thumbs/${a.slug}.webp`);
      expect(a.thumbnailSmall, a.slug).toBe(`/thumbs/${a.slug}-sm.webp`);
      expect(fs.existsSync(path.join(publicDir, a.thumbnail.url!.slice(1))), a.slug).toBe(true);
      expect(fs.existsSync(path.join(publicDir, a.thumbnailSmall!.slice(1))), a.slug).toBe(true);
      expect(a.previewMedia).toHaveLength(1);
      expect(a.previewMedia[0].viewUrl).toBe(a.thumbnail.url);
      expect(a.thumbnailAutoGenerated).toBeNull();
    }
  });

  it('has unique ids and slugs and valid status mix', () => {
    expect(new Set(assets.map((a) => a.id)).size).toBe(assets.length);
    expect(new Set(assets.map((a) => a.slug)).size).toBe(assets.length);
    const count = (s: string) => assets.filter((a) => a.status === s).length;
    expect(count('PUBLISHED')).toBeGreaterThanOrEqual(120);
    expect(count('DRAFT')).toBeGreaterThanOrEqual(8);
    expect(count('ARCHIVED')).toBeGreaterThanOrEqual(4);
    expect(count('DELETED')).toBe(0);
    for (const a of assets) {
      expect(a.title, a.id).toBeTruthy();
      expect(/[^\x00-\x7f]/.test(a.title), `${a.id} title must be English`).toBe(false);
      expect(a.titleI18n.en).toBe(a.title);
      expect(a.shortDescriptionI18n.en).toBe(a.shortDescription);
      expect(a.shortDescriptionI18n.id.length).toBeGreaterThan(0);
      expect(a.availableLocales).toEqual(['en', 'id']);
      expect(isIso(a.createdAt) && isIso(a.updatedAt), a.id).toBe(true);
      expect(Date.parse(a.createdAt)).toBeLessThan(ANCHOR);
      expect(Date.parse(a.updatedAt)).toBeLessThan(ANCHOR);
      expect(Date.parse(a.updatedAt)).toBeGreaterThanOrEqual(Date.parse(a.createdAt));
      if (a.status === 'DRAFT') expect(a.publishedAt, a.id).toBeNull();
      else expect(isIso(a.publishedAt), a.id).toBe(true);
      expect(a.totalDownloads).toBeGreaterThanOrEqual(0);
      expect(a.viewCount).toBeGreaterThanOrEqual(a.totalDownloads);
    }
  });

  it('has no dangling references from assets', () => {
    const cats = new Set(categories.map((c) => c.id));
    const lic = new Set(licenses.map((l) => l.id));
    const tagIds = new Set(tags.map((t) => t.id));
    for (const a of assets) {
      expect(userIds.has(a.ownerId), `${a.id} owner`).toBe(true);
      expect(cats.has(a.categoryId), `${a.id} category`).toBe(true);
      expect(lic.has(a.licenseId), `${a.id} license`).toBe(true);
      expect(a.tagIds.length, a.id).toBeGreaterThan(0);
      expect(new Set(a.tagIds).size).toBe(a.tagIds.length);
      for (const t of a.tagIds) expect(tagIds.has(t), `${a.id} tag ${t}`).toBe(true);
    }
  });

  it('has consistent versions, files and one AV-infected version', () => {
    let infected = 0;
    for (const a of assets) {
      expect(a.versions.length, a.id).toBeGreaterThanOrEqual(1);
      expect(a.versions.length, a.id).toBeLessThanOrEqual(3);
      expect(a.versions.filter((v) => v.isLatest).length, `${a.id} isLatest`).toBe(1);
      expect(a.versions[a.versions.length - 1].isLatest, a.id).toBe(true);
      expect(new Set(a.versions.map((v) => v.semver)).size).toBe(a.versions.length);
      for (const v of a.versions) {
        expect(v.semver).toMatch(/^\d+\.\d+\.\d+$/);
        expect(v.analysisStatus, v.id).toBe('READY');
        if (v.avStatus === 'INFECTED') infected++;
        expect(v.files).toHaveLength(1);
        expect(v.fileCount).toBe(1);
        const f = v.files[0];
        expect(f.relativePath).toBe(`${a.slug}-${v.semver}.txt`);
        expect(f.kind).toBe('OTHER');
        expect(f.meta.content).toBe(`Original asset page:\n${a.storeUrl}\n`);
        expect(f.bytes).toBe(String(Buffer.byteLength(f.meta.content, 'utf8')));
        expect(v.bytesTotal).toBe(f.bytes);
        // Locale map (what the API and versions-list.tsx use), not a bare document.
        expect(v.releaseNotes, `${v.id} notes`).not.toBeNull();
        expect((v.releaseNotes as { type?: unknown }).type, `${v.id} bare doc`).toBeUndefined();
        const locales = Object.keys(v.releaseNotes!);
        expect(locales, `${v.id} locales`).toEqual(['en']);
        for (const l of locales) {
          checkDoc(
            (v.releaseNotes as Record<string, never>)[l],
            LITE_ALLOWED_NODES,
            `${v.id} notes.${l}`,
          );
        }
        if (a.status === 'DRAFT') expect(v.publishedAt).toBeNull();
      }
    }
    expect(infected).toBe(1);
    const bad = assets.find((a) => a.versions.some((v) => v.avStatus === 'INFECTED'))!;
    expect(bad.status).toBe('PUBLISHED');
    expect(bad.ownerId).not.toBe(PERSONA);
  });

  it('has structurally valid TipTap long descriptions with a store link', () => {
    const full = new Set([...LITE_ALLOWED_NODES, 'heading', 'blockquote']);
    for (const a of assets) {
      expect(a.longDescription, a.id).not.toBeNull();
      checkDoc(a.longDescription!, full, `${a.id} longDescription`);
      const json = JSON.stringify(a.longDescription);
      expect(json, a.id).toContain(`"href":"${a.storeUrl}"`);
      expect(json, a.id).toContain(`View the original listing on ${a.storeName}`);
      expect(json.toLowerCase(), a.id).not.toContain('lorem');
      expect(json, a.id).toContain('bulletList');
    }
  });

  it('keeps tag usage counts consistent with assets', () => {
    const counts = new Map<string, number>();
    for (const a of assets) for (const t of a.tagIds) counts.set(t, (counts.get(t) ?? 0) + 1);
    for (const t of tags) {
      expect(t.usageCount, t.id).toBe(counts.get(t.id) ?? 0);
      expect(t.usageCount, t.id).toBeGreaterThan(0);
    }
  });
});

describe('persona', () => {
  const persona = users.find((u) => u.id === PERSONA);

  it('is the admin Aria Wijaya, first user', () => {
    expect(users[0].id).toBe(PERSONA);
    expect(persona).toMatchObject({
      displayName: 'Aria Wijaya',
      email: 'aria.wijaya@preview.example',
      role: 'admin',
      isAdmin: true,
      locale: 'en',
      createdAt: '2025-06-12T00:00:00.000Z',
    });
    expect(persona?.avatar.initials).toBe('AW');
  });

  it('has about 25 users with valid avatars, consistent roles and a few admins', () => {
    expect(users.length).toBeGreaterThanOrEqual(24);
    expect(users.length).toBeLessThanOrEqual(27);
    for (const u of users) {
      expect(u.email).toMatch(/@preview\.example$/);
      expect(['brand-blue', 'brand-yellow', 'brand-red', 'brand-green']).toContain(
        u.avatar.bgColor,
      );
      expect(u.isAdmin).toBe(u.role === 'admin');
    }
    expect(new Set(users.map((u) => u.email)).size).toBe(users.length);
    expect(users.filter((u) => u.isAdmin).length).toBe(3);
  });

  it('owns published, draft and archived assets, with a saved library and unread notifications', () => {
    const own = assets.filter((a) => a.ownerId === PERSONA);
    expect(own.filter((a) => a.status === 'PUBLISHED').length).toBeGreaterThanOrEqual(15);
    expect(own.filter((a) => a.status === 'DRAFT').length).toBe(2);
    expect(own.filter((a) => a.status === 'ARCHIVED').length).toBe(1);
    expect(new Set(own.map((a) => a.categoryId)).size).toBeGreaterThanOrEqual(5);
    expect(data.library.length).toBeGreaterThanOrEqual(30);
    expect(data.library.filter((l) => l.hidden).length).toBeGreaterThanOrEqual(3);
    expect(data.notifications.filter((n) => !n.readAt).length).toBeGreaterThanOrEqual(8);
  });

  it('has contributors with published assets and plain users without', () => {
    for (const u of users) {
      const n = published.filter((a) => a.ownerId === u.id).length;
      if (u.role === 'user') expect(n, u.id).toBe(0);
      else expect(n, u.id).toBeGreaterThan(0);
    }
  });
});

describe('cross-collection references', () => {
  it('library has only published assets and keeps saves counted', () => {
    for (const l of data.library) {
      const a = assetById.get(l.id);
      expect(a, l.id).toBeDefined();
      expect(a!.status, l.id).toBe('PUBLISHED');
      expect(a!.totalSaves, l.id).toBeGreaterThanOrEqual(1);
      expect(isIso(l.addedAt)).toBe(true);
      expect(Date.parse(l.addedAt)).toBeGreaterThan(Date.parse(a!.publishedAt!));
      expect(Date.parse(l.addedAt)).toBeLessThan(ANCHOR);
    }
  });

  it('comments are threaded (depth <= 5), on published assets, with valid authors and bodies', () => {
    expect(comments.length).toBeGreaterThanOrEqual(280);
    expect(comments.length).toBeLessThanOrEqual(380);
    const byId = new Map(comments.map((c) => [c.id, c]));
    let maxDepth = 0;
    let edited = 0;
    let deleted = 0;
    let issues = 0;
    const personaAuthored = comments.filter((c) => c.authorId === PERSONA);
    for (const c of comments) {
      expect(assetById.get(c.assetId)?.status, c.id).toBe('PUBLISHED');
      expect(userIds.has(c.authorId), `${c.id} author`).toBe(true);
      if (c.parentId === null) expect(c.depth).toBe(0);
      else {
        const p = byId.get(c.parentId);
        expect(p, `${c.id} parent`).toBeDefined();
        expect(p!.assetId).toBe(c.assetId);
        expect(c.depth).toBe(p!.depth + 1);
        expect(Date.parse(c.createdAt)).toBeGreaterThanOrEqual(Date.parse(p!.createdAt));
      }
      maxDepth = Math.max(maxDepth, c.depth);
      expect(c.depth).toBeLessThanOrEqual(5);
      if (c.kind === 'ISSUE') {
        issues++;
        expect(c.parentId).toBeNull();
        expect(['OPEN', 'ACKNOWLEDGED', 'RESOLVED']).toContain(c.issueStatus);
      } else expect(c.issueStatus).toBeNull();
      if (c.editedAt) {
        edited++;
        expect(Date.parse(c.editedAt)).toBeGreaterThan(Date.parse(c.createdAt));
      }
      if (c.deletedAt) deleted++;
      expect(Date.parse(c.createdAt)).toBeLessThan(ANCHOR);
      checkDoc(c.body, LITE_ALLOWED_NODES, c.id);
      expect(JSON.stringify(c.body).toLowerCase()).not.toContain('lorem');
    }
    expect(maxDepth).toBeGreaterThanOrEqual(4);
    expect(comments.filter((c) => c.depth >= 4).length).toBeGreaterThanOrEqual(2);
    expect(issues / comments.length).toBeGreaterThan(0.08);
    expect(issues / comments.length).toBeLessThan(0.18);
    expect(new Set(comments.filter((c) => c.kind === 'ISSUE').map((c) => c.issueStatus)).size).toBe(
      3,
    );
    expect(edited).toBeGreaterThanOrEqual(5);
    expect(deleted).toBeGreaterThanOrEqual(2);
    expect(deleted).toBeLessThanOrEqual(3);
    for (const c of comments.filter((x) => x.deletedAt)) {
      expect(
        comments.some((x) => x.parentId === c.id),
        `${c.id} has children`,
      ).toBe(true);
    }
    expect(personaAuthored.length).toBeGreaterThanOrEqual(25);
    const personaIds = new Set(personaAuthored.map((c) => c.id));
    expect(comments.filter((c) => c.parentId && personaIds.has(c.parentId)).length).toBeGreaterThan(
      5,
    );
  });

  it('notifications cover all types, newest first, with resolvable references', () => {
    const types = [
      'COMMENT_CREATED',
      'COMMENT_REPLY',
      'ISSUE_CREATED',
      'ISSUE_STATUS_CHANGED',
      'REQUEST_CREATED',
      'REQUEST_STATUS_CHANGED',
      'REPORT_CREATED',
      'REPORT_RECEIVED_FOR_YOUR_ASSET',
      'FEATURED_FEATURED',
      'VERSION_PUBLISHED',
      'ANALYZER_FAILED',
      'ADMIN_PROMOTED',
      'ADMIN_DEMOTED',
    ];
    const ns = data.notifications;
    expect(ns.length).toBeGreaterThanOrEqual(14);
    expect(new Set(ns.map((n) => n.type))).toEqual(new Set(types));
    const commentIds = new Set(comments.map((c) => c.id));
    for (let i = 0; i < ns.length; i++) {
      const n = ns[i];
      expect(isIso(n.createdAt)).toBe(true);
      if (i > 0)
        expect(Date.parse(ns[i - 1].createdAt)).toBeGreaterThanOrEqual(Date.parse(n.createdAt));
      if (n.readAt) expect(Date.parse(n.readAt)).toBeGreaterThanOrEqual(Date.parse(n.createdAt));
      const p = n.payload as Record<string, string>;
      if (p.assetId) {
        const a = assetById.get(p.assetId);
        expect(a, `${n.id} asset`).toBeDefined();
        expect(p.assetSlug, n.id).toBe(a!.slug);
        expect(p.assetTitle, n.id).toBe(a!.title);
      }
      if (p.commentId) expect(commentIds.has(p.commentId), `${n.id} comment`).toBe(true);
    }
    // the unread ones are the newest ones
    const firstRead = ns.findIndex((n) => n.readAt);
    expect(ns.slice(firstRead).every((n) => n.readAt)).toBe(true);
  });

  it('requests cover every status, including two by the persona', () => {
    const rs = data.requests;
    expect(rs.length).toBeGreaterThanOrEqual(10);
    expect(new Set(rs.map((r) => r.status))).toEqual(
      new Set(['SENT', 'IN_REVIEW', 'PENDING', 'APPROVED', 'REJECTED']),
    );
    const mine = rs.filter((r) => r.requesterId === PERSONA);
    expect(mine.length).toBe(2);
    expect(mine.map((r) => r.status).sort()).toEqual(['APPROVED', 'PENDING']);
    for (const r of rs) {
      expect(userIds.has(r.requesterId)).toBe(true);
      if (r.reviewedById) expect(userIds.has(r.reviewedById)).toBe(true);
      expect(r.assetLink).toMatch(/^https:\/\//);
      if (r.status === 'APPROVED' || r.status === 'REJECTED') expect(r.adminComment).toBeTruthy();
    }
  });

  it('reports cover every status and reference real assets and users', () => {
    const rs = data.reports;
    expect(rs.length).toBeGreaterThanOrEqual(8);
    expect(new Set(rs.map((r) => r.status))).toEqual(
      new Set(['OPEN', 'REVIEWING', 'ACTIONED', 'DISMISSED']),
    );
    for (const r of rs) {
      expect(assetById.has(r.assetId), r.id).toBe(true);
      expect(userIds.has(r.reporterId), r.id).toBe(true);
      if (r.resolvedById) expect(userIds.has(r.resolvedById)).toBe(true);
      const done = r.status === 'ACTIONED' || r.status === 'DISMISSED';
      expect(Boolean(r.resolvedAt), r.id).toBe(done);
      expect(r.action !== null, r.id).toBe(r.status === 'ACTIONED');
    }
    expect(rs.some((r) => assetById.get(r.assetId)?.ownerId === PERSONA)).toBe(true);
  });

  it('audit entries reference real subjects and actors within the 30-day window', () => {
    const maps: Record<string, Set<string>> = {
      Asset: new Set(assets.map((a) => a.id)),
      User: userIds,
      Tag: new Set(tags.map((t) => t.id)),
      Category: new Set(categories.map((c) => c.id)),
      License: new Set(licenses.map((l) => l.id)),
      FeaturedSlot: new Set(data.featured.map((f) => f.id)),
      Report: new Set(data.reports.map((r) => r.id)),
      AssetRequest: new Set(data.requests.map((r) => r.id)),
      Device: new Set(data.devices.map((d) => d.id)),
    };
    expect(data.audit.length).toBeGreaterThanOrEqual(100);
    for (const e of data.audit) {
      expect(maps[e.subjectType], `${e.id} subjectType ${e.subjectType}`).toBeDefined();
      expect(maps[e.subjectType].has(e.subjectId), `${e.id} subject`).toBe(true);
      if (e.actorId !== null) expect(userIds.has(e.actorId), `${e.id} actor`).toBe(true);
      const age = ANCHOR - Date.parse(e.createdAt);
      expect(age).toBeGreaterThan(0);
      expect(age).toBeLessThanOrEqual(30 * 86_400_000);
      expect(e.action).toMatch(/^[a-z_]+\.[a-z_]+$/);
    }
    expect(data.audit.some((e) => e.actorId === null)).toBe(true);
  });

  it('has 5 featured slots on published assets, 2 devices and 30 webhook deliveries', () => {
    const f = data.featured;
    expect(f.length).toBe(5);
    expect(f.map((x) => x.sortOrder).sort()).toEqual([1, 2, 3, 4, 5]);
    for (const s of f) {
      const a = assetById.get(s.assetId);
      expect(a?.status, s.id).toBe('PUBLISHED');
      expect(s.customBannerUrl, s.id).toBe(a!.thumbnail.url);
    }
    expect(new Set(f.map((s) => s.assetId)).size).toBe(5);
    expect(f.some((s) => assetById.get(s.assetId)?.ownerId === PERSONA)).toBe(true);
    expect(data.devices.length).toBe(2);
    expect(data.devices.filter((d) => d.revokedAt).length).toBe(1);
    for (const d of data.devices) expect(userIds.has(d.userId)).toBe(true);
    expect(data.webhooks.length).toBe(30);
    expect(new Set(data.webhooks.map((w) => w.status))).toEqual(
      new Set(['success', 'failure', 'pending']),
    );
  });

  it('has storage rollups consistent with assets, users and buckets', () => {
    const st = data.storage;
    const assetRows = st.filter((s) => s.kind === 'asset');
    const userRows = st.filter((s) => s.kind === 'user');
    const buckets = st.filter((s) => s.kind === 'bucket');
    expect(assetRows.length).toBe(assets.length);
    expect(buckets.map((b) => b.bucket).sort()).toEqual(
      ['derived', 'editor', 'featured', 'source', 'thumbs'].sort(),
    );
    for (const r of assetRows) {
      expect(assetById.has(r.refId)).toBe(true);
      expect(r.spark).toHaveLength(30);
      expect(r.spark[29]).toBe(r.bytes);
    }
    const owners = new Set(assets.map((a) => a.ownerId));
    expect(userRows.map((u) => u.refId).sort()).toEqual([...owners].sort());
    for (const u of userRows) {
      const owned = assetRows.filter((r) => assetById.get(r.refId)!.ownerId === u.refId);
      expect(u.bytes, u.id).toBe(owned.reduce((s, r) => s + r.bytes, 0));
      expect(u.spark[29]).toBe(u.bytes);
      for (let i = 0; i < 30; i++) {
        expect(u.spark[i], `${u.id}[${i}]`).toBe(owned.reduce((s, r) => s + r.spark[i], 0));
      }
    }
    const source = buckets.find((b) => b.bucket === 'source')!;
    expect(source.bytes).toBe(assetRows.reduce((s, r) => s + r.bytes, 0));
  });

  it('has analytics for every published asset, with detail for persona assets', () => {
    const an = data.analytics;
    const platform = an.find((a) => a.kind === 'platform');
    expect(platform?.kind === 'platform' && platform.downloads.length).toBe(90);
    const perAsset = an.filter((a) => a.kind === 'asset');
    expect(perAsset.map((a) => a.assetId).sort()).toEqual(published.map((a) => a.id).sort());
    for (const r of perAsset) {
      const a = assetById.get(r.assetId)!;
      expect(r.downloads30d).toBeGreaterThanOrEqual(r.downloads7d);
      expect(r.downloads30d).toBeLessThanOrEqual(a.totalDownloads);
      if (a.ownerId === PERSONA) {
        expect(r.detail, a.id).not.toBeNull();
        const d = r.detail!;
        const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
        expect(d.daily).toHaveLength(90);
        const total = sum(d.daily);
        expect(total).toBeLessThanOrEqual(a.totalDownloads);
        expect(sum(Object.values(d.byCountry))).toBe(total);
        expect(sum(Object.values(d.bySource))).toBe(total);
        expect(sum(d.byVersion.map((v) => v.downloads))).toBe(total);
        expect(sum(d.byFile.map((v) => v.downloads))).toBe(total);
        expect(sum(d.daily.slice(60))).toBe(r.downloads30d);
        expect(sum(d.daily.slice(83))).toBe(r.downloads7d);
        for (const v of d.byVersion)
          expect(a.versions.some((x) => x.id === v.versionId)).toBe(true);
      } else expect(r.detail).toBeNull();
    }
    // platform total over 30d covers at least the persona assets' downloads
    const p30 =
      platform!.kind === 'platform' ? platform!.downloads.slice(60).reduce((s, x) => s + x, 0) : 0;
    const asset30 = perAsset.reduce((s, r) => s + r.downloads30d, 0);
    expect(p30).toBe(asset30);
  });
});

describe('demo realism (fix round 1)', () => {
  const bodyKey = (c: { body: unknown }) => JSON.stringify(c.body);
  const live = comments.filter((c) => !c.deletedAt);
  const DAY_MS = 86_400_000;

  it('has varied comment bodies: 70% distinct, none more than 3 times, none repeated in an asset', () => {
    const uses = new Map<string, number>();
    const perAsset = new Set<string>();
    for (const c of live) {
      uses.set(bodyKey(c), (uses.get(bodyKey(c)) ?? 0) + 1);
      const k = `${c.assetId}|${bodyKey(c)}`;
      expect(perAsset.has(k), `${c.id} repeats a body inside ${c.assetId}`).toBe(false);
      perAsset.add(k);
    }
    expect(uses.size / live.length).toBeGreaterThanOrEqual(0.7);
    for (const [k, n] of uses) expect(n, k.slice(0, 80)).toBeLessThanOrEqual(3);
  });

  it('makes replies that fit what they answer (spot checks)', () => {
    const byId = new Map(comments.map((c) => [c.id, c]));
    const text = (c: { body: TipTapDoc }) => JSON.stringify(c.body);
    for (const c of live) {
      if (!c.parentId) continue;
      const p = byId.get(c.parentId)!;
      if (/I do not have a video yet/.test(text(c))) {
        expect(text(p), c.id).toMatch(/video|tutorial|walkthrough/i);
      }
      if (/Fixed in version|is resolved in/.test(text(c))) expect(p.kind, c.id).toBe('ISSUE');
    }
  });

  it('keeps comment authors, publish dates and versions in order', () => {
    const userCreated = new Map(users.map((u) => [u.id, Date.parse(u.createdAt)]));
    for (const c of comments) {
      expect(Date.parse(c.createdAt), c.id).toBeGreaterThanOrEqual(userCreated.get(c.authorId)!);
      expect(Date.parse(c.createdAt), c.id).toBeGreaterThan(
        Date.parse(assetById.get(c.assetId)!.publishedAt!),
      );
    }
    for (const a of assets) {
      const pubs = a.versions.map((v) => (v.publishedAt ? Date.parse(v.publishedAt) : Infinity));
      for (let i = 1; i < pubs.length; i++) expect(pubs[i], a.id).toBeGreaterThan(pubs[i - 1]);
      for (const v of a.versions) {
        expect(Date.parse(v.createdAt), v.id).toBeGreaterThanOrEqual(Date.parse(a.createdAt));
        if (v.publishedAt) {
          expect(Date.parse(v.publishedAt), v.id).toBeGreaterThanOrEqual(Date.parse(v.createdAt));
        }
      }
      if (a.publishedAt) {
        expect(Date.parse(a.publishedAt), a.id).toBeGreaterThanOrEqual(Date.parse(a.createdAt));
        expect(a.versions[0].publishedAt, a.id).toBe(a.publishedAt);
      }
    }
    for (const r of data.reports) {
      expect(Date.parse(r.createdAt), r.id).toBeGreaterThan(
        Date.parse(assetById.get(r.assetId)!.publishedAt!),
      );
      expect(Date.parse(r.createdAt), r.id).toBeGreaterThanOrEqual(userCreated.get(r.reporterId)!);
    }
    for (const r of data.requests) {
      expect(Date.parse(r.createdAt), r.id).toBeGreaterThanOrEqual(userCreated.get(r.requesterId)!);
    }
    for (const e of data.audit) {
      if (e.subjectType !== 'Asset') continue;
      const a = assetById.get(e.subjectId)!;
      expect(Date.parse(e.createdAt), e.id).toBeGreaterThanOrEqual(
        Date.parse(a.publishedAt ?? a.createdAt),
      );
    }
    for (const an of data.analytics) {
      if (an.kind !== 'asset' || !an.detail) continue;
      const pubDay =
        Math.floor(Date.parse(assetById.get(an.assetId)!.publishedAt!) / DAY_MS) * DAY_MS;
      const end = Date.parse(`${an.endDate}T00:00:00Z`);
      an.detail.daily.forEach((n, i) => {
        if (end - (89 - i) * DAY_MS < pubDay) expect(n, `${an.id}[${i}]`).toBe(0);
      });
    }
  });

  it('applies ownership transfers to the assets', () => {
    const transfers = data.audit.filter((e) => e.action === 'asset.transfer');
    expect(transfers.length).toBeGreaterThanOrEqual(3);
    const lastTo = new Map<string, string>();
    for (const e of transfers) lastTo.set(e.subjectId, String(e.metadata?.toOwnerId));
    for (const [assetId, to] of lastTo) expect(assetById.get(assetId)!.ownerId, assetId).toBe(to);
    for (const e of transfers) {
      expect(e.metadata?.fromOwnerId).not.toBe(PERSONA);
      expect(e.metadata?.toOwnerId).not.toBe(PERSONA);
    }
    for (const a of assets.filter((x) => x.ownerId === PERSONA)) {
      expect(a.storeName, a.id).not.toBe('BOOTH');
    }
  });

  it('fills the last 30 days: signups and publishes on many days, no all-zero chart series', () => {
    const lo = ANCHOR - 30 * DAY_MS;
    const inWindow = (s: string | null) =>
      s !== null && Date.parse(s) >= lo && Date.parse(s) < ANCHOR;
    const publishDays = assets
      .filter((a) => inWindow(a.publishedAt))
      .map((a) => a.publishedAt!.slice(0, 10));
    const signupDays = users
      .filter((u) => inWindow(u.createdAt))
      .map((u) => u.createdAt.slice(0, 10));
    expect(new Set([...publishDays, ...signupDays]).size).toBeGreaterThanOrEqual(10);
    expect(publishDays.length).toBeGreaterThanOrEqual(10);
    expect(publishDays.length).toBeLessThanOrEqual(16);
    expect(signupDays.length).toBeGreaterThanOrEqual(6);
    expect(signupDays.length).toBeLessThanOrEqual(8);
    const platform = data.analytics.find((a) => a.kind === 'platform');
    expect(
      platform?.kind === 'platform' && platform.downloads.slice(60).every((n) => n === 0),
    ).toBe(false);
  });

  it('has no self-reviewed requests and whole-second timestamps everywhere', () => {
    for (const r of data.requests) expect(r.reviewedById, r.id).not.toBe(r.requesterId);
    for (const c of COLLECTIONS) {
      const raw = fs.readFileSync(path.join(seedDir, `${c}.json`), 'utf8');
      expect(raw.match(/"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.(?!000Z)\d+Z"/g), c).toBeNull();
    }
  });

  it('has no dangling ids inside payloads and metadata', () => {
    const fileIds = new Set(
      assets.flatMap((a) => a.versions.flatMap((v) => v.files.map((f) => f.id))),
    );
    const requestIds = new Set(data.requests.map((r) => r.id));
    const reportIds = new Set(data.reports.map((r) => r.id));
    const featuredIds = new Set(data.featured.map((f) => f.id));
    for (const n of data.notifications) {
      const p = n.payload as Record<string, string>;
      if (p.requestId) expect(requestIds.has(p.requestId), `${n.id} request`).toBe(true);
      if (p.reportId) expect(reportIds.has(p.reportId), `${n.id} report`).toBe(true);
      if (p.featuredId) expect(featuredIds.has(p.featuredId), `${n.id} featured`).toBe(true);
      if (p.versionId) {
        expect(
          assetById.get(p.assetId)!.versions.some((v) => v.id === p.versionId),
          n.id,
        ).toBe(true);
      }
      if (p.assetId) {
        const a = assetById.get(p.assetId)!;
        expect(Date.parse(n.createdAt), n.id).toBeGreaterThan(
          Date.parse(a.publishedAt ?? a.createdAt),
        );
      }
    }
    for (const w of data.webhooks) {
      const body = w.requestBody as { asset?: { id: string; slug: string; title: string } };
      if (!body.asset) continue;
      const a = assetById.get(body.asset.id);
      expect(a, `${w.id} asset`).toBeDefined();
      expect(body.asset.slug).toBe(a!.slug);
      expect(body.asset.title).toBe(a!.title);
      expect(Date.parse(w.createdAt), w.id).toBeGreaterThan(Date.parse(a!.publishedAt!));
    }
    for (const e of data.audit) {
      const m = (e.metadata ?? {}) as Record<string, unknown>;
      for (const k of ['fromOwnerId', 'toOwnerId']) {
        if (m[k] !== undefined) expect(userIds.has(String(m[k])), `${e.id} ${k}`).toBe(true);
      }
      if (typeof m.assetId === 'string')
        expect(assetById.has(m.assetId), `${e.id} assetId`).toBe(true);
    }
    for (const an of data.analytics) {
      if (an.kind !== 'asset' || !an.detail) continue;
      const own = new Set(
        assetById.get(an.assetId)!.versions.flatMap((v) => v.files.map((f) => f.id)),
      );
      for (const f of an.detail.byFile) {
        expect(fileIds.has(f.fileId), `${an.id} ${f.fileId}`).toBe(true);
        expect(own.has(f.fileId), `${an.id} file belongs to asset`).toBe(true);
      }
    }
  });
});

describe('build-seed determinism', () => {
  const tsx = path.join(root, 'node_modules/tsx/dist/cli.mjs');
  const script = path.join(root, 'scripts/seed/build-seed.ts');
  const norm = (b: Buffer) => b.toString('utf8').replace(/\r\n/g, '\n');

  const build = (dir: string) =>
    execFileSync(process.execPath, [tsx, script, '--out', dir], { cwd: root, stdio: 'pipe' });

  it('produces byte-identical output twice and matches the committed seed data', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'seed-'));
    const a = path.join(tmp, 'a');
    const b = path.join(tmp, 'b');
    try {
      build(a);
      build(b);
      for (const c of COLLECTIONS) {
        const fa = fs.readFileSync(path.join(a, `${c}.json`));
        const fb = fs.readFileSync(path.join(b, `${c}.json`));
        expect(fa.equals(fb), `${c} twice`).toBe(true);
        // git may check files out with CRLF on Windows: compare line-ending-insensitively
        const committed = fs.readFileSync(path.join(seedDir, `${c}.json`));
        expect(
          norm(committed) === norm(fa),
          `${c} committed seed is stale: run pnpm seed:build`,
        ).toBe(true);
      }
      expect(fs.readdirSync(a).sort()).toEqual(COLLECTIONS.map((c) => `${c}.json`).sort());
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }, 120_000);
});

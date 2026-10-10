import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSeededTestApp, type TestApp } from '@/preview/test-utils';
import type {
  AdminAssetRequestPage,
  AdminAuditPage,
  AdminAvRow,
  AdminCategory,
  AdminFeaturedSlot,
  AdminLicense,
  AdminReport,
  AdminReportPage,
  AdminTagPage,
  AdminTagRow,
  AdminWebhookPage,
  DashboardResponse,
} from '@/lib/api/admin-types';
import type { AssetRequest, DiscoverResponse } from '@/lib/api/types';
import type { AssetRecord, AuditRecord } from '@/preview/records';
import { SCHEDULED_RESCAN_MS } from '@/preview/handlers/admin/av';

const NOW = '2026-10-10T12:00:00.000Z';
const app = (opts: { timers?: boolean } = {}): Promise<TestApp> =>
  createSeededTestApp({ timers: opts.timers ?? false, now: NOW });

afterEach(() => {
  vi.useRealTimers();
});

/** Every page of a cursor list. */
async function allPages<T extends { id: string }>(
  a: TestApp,
  path: string,
  query: Record<string, unknown> = {},
): Promise<T[]> {
  const out: T[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 50; i += 1) {
    const page = await a.call<{
      items: T[];
      pageInfo: { hasMore: boolean; nextCursor: string | null };
    }>('GET', path, { query: { ...query, limit: 50, cursor } });
    out.push(...page.items);
    if (!page.pageInfo.hasMore) break;
    cursor = page.pageInfo.nextCursor!;
  }
  return out;
}

const fresh = () => ({ confirm: 'I understand', confirmedAt: new Date(NOW).toISOString() });

describe('admin reports over the real seed', () => {
  it('lists the ten seeded reports and opens each one', async () => {
    const a = await app();
    const rows = await allPages<AdminReport>(a, '/admin/reports');
    expect(rows).toHaveLength(10);
    expect(new Set(rows.map((r) => r.status))).toEqual(
      new Set(['OPEN', 'REVIEWING', 'ACTIONED', 'DISMISSED']),
    );
    for (const row of rows) {
      expect(row.assetTitle).not.toBe('(deleted asset)');
      expect(row.assetSlug).not.toBe('');
      expect(row.reporter.displayName).not.toBe('(unknown)');
      expect(await a.call('GET', `/admin/reports/${row.id}`)).toEqual(row);
    }
    const page = await a.call<AdminReportPage>('GET', '/admin/reports', {
      query: { status: 'OPEN', limit: 50 },
    });
    expect(page.items).toHaveLength(3);
  });

  it('runs the whole lifecycle on seeded data and moves the dashboard counter', async () => {
    const a = await app();
    const pending = async () =>
      (await a.call<DashboardResponse>('GET', '/admin/dashboard')).counts.pendingReports;
    expect(await pending()).toBe(5);
    const open = (
      await a.call<AdminReportPage>('GET', '/admin/reports', { query: { status: 'OPEN' } })
    ).items[0]!;
    await a.call('POST', `/admin/reports/${open.id}/start-review`);
    expect(await pending()).toBe(5);
    await a.call('POST', `/admin/reports/${open.id}/action`, {
      body: { adminNotes: 'Archived while we investigate.', action: 'ARCHIVE_ASSET' },
    });
    expect(await pending()).toBe(4);
    const asset = await a.db.get<AssetRecord>('assets', open.assetId);
    expect(asset!.status).toBe('ARCHIVED');
    expect((await a.call<AdminReport>('GET', `/admin/reports/${open.id}`)).status).toBe('ACTIONED');
  });

  it('keeps every report readable after its asset was force-deleted', async () => {
    const a = await app();
    const target = (await allPages<AdminReport>(a, '/admin/reports'))[0]!;
    await a.call('POST', `/admin/assets/${target.assetId}/force-delete`, {
      body: { ...fresh(), reason: 'Legal takedown' },
    });
    const rows = await allPages<AdminReport>(a, '/admin/reports');
    expect(rows).toHaveLength(10);
    expect(rows.find((r) => r.id === target.id)).toMatchObject({
      assetTitle: '(deleted asset)',
      assetSlug: '',
    });
    await a
      .call('POST', `/admin/reports/${target.id}/dismiss`, {
        body: { adminNotes: 'The asset is gone.' },
      })
      .catch((e) => {
        // an already resolved seeded report cannot be dismissed (409); that is fine here
        expect(e).toMatchObject({ status: 409 });
      });
  });
});

describe('admin asset requests over the real seed', () => {
  it('lists the twelve seeded requests and opens each one', async () => {
    const a = await app();
    const rows = await allPages<AssetRequest>(a, '/admin/asset-requests');
    expect(rows).toHaveLength(12);
    expect(new Set(rows.map((r) => r.status))).toEqual(
      new Set(['SENT', 'IN_REVIEW', 'PENDING', 'APPROVED', 'REJECTED']),
    );
    for (const row of rows) {
      expect(row.requester.displayName).not.toBe('(unknown)');
      expect(await a.call('GET', `/admin/asset-requests/${row.id}`)).toEqual(row);
    }
    const sent = await a.call<AdminAssetRequestPage>('GET', '/admin/asset-requests', {
      query: { status: 'SENT' },
    });
    expect(sent.items).toHaveLength(2);
  });

  it('decides a request, moves pendingRequests and notifies the persona about her own', async () => {
    const a = await app();
    const pending = async () =>
      (await a.call<DashboardResponse>('GET', '/admin/dashboard')).counts.pendingRequests;
    expect(await pending()).toBe(7);
    const sent = (
      await a.call<AdminAssetRequestPage>('GET', '/admin/asset-requests', {
        query: { status: 'SENT' },
      })
    ).items[0]!;
    await a.call('PATCH', `/admin/asset-requests/${sent.id}`, {
      body: { status: 'REJECTED', adminComment: 'We already have a similar asset.' },
    });
    expect(await pending()).toBe(6);
    // req-10 is the persona's own pending request
    await a.call('PATCH', '/admin/asset-requests/req-10', {
      body: { status: 'APPROVED', adminComment: 'Go ahead.' },
    });
    const inbox = await a.call<{
      items: Array<{ type: string; payload: Record<string, unknown> }>;
    }>('GET', '/notifications');
    expect(inbox.items[0]).toMatchObject({
      type: 'REQUEST_STATUS_CHANGED',
      payload: { requestId: 'req-10', status: 'APPROVED' },
    });
  });
});

describe('admin featured over the real seed', () => {
  it('shows the five seeded slots with 0-based positions, as /discover carries them', async () => {
    const a = await app();
    const slots = await a.call<AdminFeaturedSlot[]>('GET', '/admin/featured');
    expect(slots.map((s) => s.sortOrder)).toEqual([0, 1, 2, 3, 4]);
    expect(slots.every((s) => s.isActive && s.assetTitle && s.assetSlug)).toBe(true);
    const discover = await a.call<DiscoverResponse>('GET', '/discover');
    expect(discover.featured.map((f) => f.id)).toEqual(slots.map((s) => s.id));
  });

  it('refuses a 6th active slot, accepts one after a delete, and /discover follows each step', async () => {
    const a = await app();
    const published = (await a.db.list<AssetRecord>('assets')).filter(
      (x) => x.status === 'PUBLISHED',
    );
    const slots = await a.call<AdminFeaturedSlot[]>('GET', '/admin/featured');
    const featured = new Set(slots.map((s) => s.assetId));
    const [first, second] = published.filter((x) => !featured.has(x.id));
    await expect(
      a.call('POST', '/admin/featured', { body: { assetId: first!.id } }),
    ).rejects.toMatchObject({ status: 409, code: 'featured.active_cap_reached' });
    await a.call('DELETE', `/admin/featured/${slots[1]!.id}`);
    expect((await a.call<DiscoverResponse>('GET', '/discover')).featured).toHaveLength(4);
    const added = await a.call<AdminFeaturedSlot>('POST', '/admin/featured', {
      body: { assetId: second!.id },
    });
    const discover = (await a.call<DiscoverResponse>('GET', '/discover')).featured;
    expect(discover.map((f) => f.id).at(-1)).toBe(added.id);
    expect(discover).toHaveLength(5);
    const ordered = [...discover.map((f) => f.id)].reverse();
    await a.call('POST', '/admin/featured/reorder', { body: { orderedIds: ordered } });
    expect((await a.call<DiscoverResponse>('GET', '/discover')).featured.map((f) => f.id)).toEqual(
      ordered,
    );
  });
});

describe('admin categories and licenses over the real seed', () => {
  it('lists the ten categories; the counts add up to the live assets', async () => {
    const a = await app();
    const rows = await a.call<AdminCategory[]>('GET', '/admin/categories');
    expect(rows).toHaveLength(10);
    const live = (await a.db.list<AssetRecord>('assets')).filter((x) => x.status !== 'DELETED');
    expect(rows.reduce((s, c) => s + c.assetCount, 0)).toBe(live.length);
    expect(rows.every((c) => c.name.en && c.name.id && c.iconUrl === null)).toBe(true);
  });

  it('refuses to delete any seeded category, but a new empty one goes; renames reach /categories', async () => {
    const a = await app();
    const rows = await a.call<AdminCategory[]>('GET', '/admin/categories');
    for (const c of rows) {
      await expect(a.call('DELETE', `/admin/categories/${c.id}`)).rejects.toMatchObject({
        status: 409,
        code: 'category.in_use',
      });
    }
    const made = await a.call<AdminCategory>('POST', '/admin/categories', {
      body: { slug: 'brand-new', name: { en: 'Brand New', id: 'Baru Sekali' } },
    });
    expect((await a.call<AdminCategory[]>('GET', '/admin/categories')).at(-1)!.id).toBe(made.id);
    await a.call('PATCH', `/admin/categories/${made.id}`, {
      body: { name: { en: 'Brand Newer' } },
    });
    expect(
      (await a.call<Array<{ id: string; name: string }>>('GET', '/categories')).find(
        (c) => c.id === made.id,
      )!.name,
    ).toBe('Brand Newer');
    await a.call('DELETE', `/admin/categories/${made.id}`);
    expect(await a.call<AdminCategory[]>('GET', '/admin/categories')).toHaveLength(10);
    // reorder everything reversed, /categories follows
    const ids = rows.map((c) => c.id).reverse();
    await a.call('POST', '/admin/categories/reorder', { body: { orderedIds: ids } });
    expect((await a.call<Array<{ id: string }>>('GET', '/categories')).map((c) => c.id)).toEqual(
      ids,
    );
  });

  it('lists the seven licenses, refuses to delete used ones and deletes a new one', async () => {
    const a = await app();
    const rows = await a.call<AdminLicense[]>('GET', '/admin/licenses');
    expect(rows).toHaveLength(7);
    const used = rows.filter((l) => l.assetCount > 0);
    const unused = rows.filter((l) => l.assetCount === 0);
    expect(used.length).toBeGreaterThanOrEqual(4);
    expect(unused.length).toBeGreaterThanOrEqual(1);
    await expect(a.call('DELETE', `/admin/licenses/${used[0]!.id}`)).rejects.toMatchObject({
      status: 409,
      code: 'license.in_use',
    });
    await a.call('DELETE', `/admin/licenses/${unused[0]!.id}`);
    expect(await a.call<AdminLicense[]>('GET', '/admin/licenses')).toHaveLength(6);
    expect((await a.call<unknown[]>('GET', '/licenses')).length).toBeLessThanOrEqual(6);
  });
});

describe('admin tags over the real seed', () => {
  const liveUsage = (assets: AssetRecord[]) => {
    const usage = new Map<string, number>();
    for (const x of assets) {
      if (x.status === 'DELETED') continue;
      for (const t of x.tagIds) usage.set(t, (usage.get(t) ?? 0) + 1);
    }
    return usage;
  };

  it('walks all tags once, in name order', async () => {
    const a = await app();
    const rows = await allPages<AdminTagRow>(a, '/admin/tags');
    expect(rows).toHaveLength(338);
    expect(new Set(rows.map((r) => r.id)).size).toBe(338);
    const names = rows.map((r) => r.displayName.toLowerCase());
    expect(names).toEqual([...names].sort());
    const filtered = await a.call<AdminTagPage>('GET', '/admin/tags', { query: { q: 'pixel' } });
    expect(filtered.items.length).toBeGreaterThan(0);
    expect(
      filtered.items.every(
        (t) => t.slug.includes('pixel') || t.displayName.toLowerCase().includes('pixel'),
      ),
    ).toBe(true);
  });

  it('merges two real tags: assets repointed once, counters still equal the live assets', async () => {
    const a = await app();
    const before = await a.db.list<AssetRecord>('assets');
    const usage = liveUsage(before);
    const tags = (await allPages<AdminTagRow>(a, '/admin/tags', { sort: 'usage' })).filter(
      (t) => t.usageCount > 0,
    );
    // two of the most used tags share assets
    const [target, s1, s2] = tags as [AdminTagRow, AdminTagRow, AdminTagRow];
    await a.call('POST', '/admin/tags/merge', {
      body: { fromTagIds: [s1.id, s2.id], intoTagId: target.id },
    });
    const after = await a.db.list<AssetRecord>('assets');
    for (const x of after) {
      expect(new Set(x.tagIds).size).toBe(x.tagIds.length);
      expect(x.tagIds).not.toContain(s1.id);
      expect(x.tagIds).not.toContain(s2.id);
    }
    const expected = after.filter((x) => x.tagIds.includes(target.id) && x.status !== 'DELETED');
    const rows = await allPages<AdminTagRow>(a, '/admin/tags');
    expect(rows).toHaveLength(336);
    expect(rows.find((r) => r.id === target.id)!.usageCount).toBe(expected.length);
    expect(expected.length).toBeGreaterThanOrEqual(usage.get(target.id)!);
    // every counter in the list still equals the live assets that carry the tag
    const now = liveUsage(after);
    for (const r of rows) expect(r.usageCount, r.slug).toBe(now.get(r.id) ?? 0);
    // the public list and an asset detail follow
    expect(
      (await a.call<unknown[]>('GET', '/tags', { query: { limit: 200 } })).length,
    ).toBeLessThanOrEqual(200);
    const victim = before.find((x) => x.tagIds.includes(s1.id) && x.status === 'PUBLISHED');
    if (victim) {
      const detail = await a.call<{ tags: Array<{ id: string }> }>('GET', `/assets/${victim.slug}`);
      expect(detail.tags.some((t) => t.id === target.id)).toBe(true);
      expect(detail.tags.some((t) => t.id === s1.id)).toBe(false);
    }
  });

  it('renames a tag and refuses a slug that another tag holds', async () => {
    const a = await app();
    const [one, two] = (await allPages<AdminTagRow>(a, '/admin/tags')) as [
      AdminTagRow,
      AdminTagRow,
    ];
    await expect(
      a.call('PATCH', `/admin/tags/${one.id}`, { body: { slug: two.slug, displayName: 'X' } }),
    ).rejects.toMatchObject({ status: 409, code: 'tag.in_use' });
    const res = await a.call<AdminTagRow>('PATCH', `/admin/tags/${one.id}`, {
      body: { slug: one.slug, displayName: 'Zebra Renamed' },
    });
    expect(res.displayName).toBe('Zebra Renamed');
  });
});

describe('admin AV and webhooks over the real seed', () => {
  it('shows the one infected version; acknowledging it zeroes the dashboard counter', async () => {
    const a = await app();
    const rows = await a.call<AdminAvRow[]>('GET', '/admin/av/infected');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      assetId: 'a-universal-animation-library',
      semver: '1.0.0',
      avStatus: 'INFECTED',
      assetStatus: 'PUBLISHED',
    });
    expect(rows[0]!.files).toHaveLength(1);
    const count = async () =>
      (await a.call<DashboardResponse>('GET', '/admin/dashboard')).counts.avInfected;
    expect(await count()).toBe(1);
    await a.call('POST', `/admin/av/${rows[0]!.versionId}/acknowledge`);
    expect(await count()).toBe(0);
    expect(await a.call<AdminAvRow[]>('GET', '/admin/av/infected')).toEqual([]);
  });

  it('a rescan clears it after two seconds', async () => {
    vi.useFakeTimers({ now: new Date(NOW) });
    const a = await app({ timers: true });
    const [row] = await a.call<AdminAvRow[]>('GET', '/admin/av/infected');
    await a.call('POST', `/admin/av/${row!.versionId}/rescan`);
    expect((await a.call<DashboardResponse>('GET', '/admin/dashboard')).counts.avInfected).toBe(1);
    await vi.advanceTimersByTimeAsync(SCHEDULED_RESCAN_MS + 10);
    expect((await a.call<DashboardResponse>('GET', '/admin/dashboard')).counts.avInfected).toBe(0);
  });

  it('quarantine archives the infected asset', async () => {
    const a = await app();
    const [row] = await a.call<AdminAvRow[]>('GET', '/admin/av/infected');
    await a.call('POST', `/admin/av/${row!.versionId}/quarantine`);
    expect((await a.db.get<AssetRecord>('assets', row!.assetId))!.status).toBe('ARCHIVED');
  });

  it('lists the thirty webhook deliveries; the status filters add up', async () => {
    const a = await app();
    const rows = await allPages<AdminWebhookPage['items'][number]>(a, '/admin/webhook-deliveries');
    expect(rows).toHaveLength(30);
    const byStatus = async (s: string) =>
      (
        await a.call<AdminWebhookPage>('GET', '/admin/webhook-deliveries', {
          query: { status: s, limit: 50 },
        })
      ).items.length;
    expect(
      (await byStatus('success')) + (await byStatus('failure')) + (await byStatus('pending')),
    ).toBe(30);
    expect(await byStatus('pending')).toBe(1);
    const twoPages = await a.call<AdminWebhookPage>('GET', '/admin/webhook-deliveries', {
      query: { limit: 20 },
    });
    expect(twoPages.pageInfo.hasMore).toBe(true);
    const typed = await a.call<AdminWebhookPage>('GET', '/admin/webhook-deliveries', {
      query: { type: 'featured' },
    });
    expect(typed.items.length).toBeGreaterThan(0);
    expect(typed.items.every((d) => d.type.includes('featured'))).toBe(true);
  });
});

describe('the audit log after 11b mutations', () => {
  it('shows each new row on top with the seeded rows columns', async () => {
    const a = await app();
    const seeded = await a.call<AdminAuditPage>('GET', '/admin/audit', { query: { limit: 100 } });
    const seededKeys = Object.keys(seeded.items[0]!).sort();
    const before = new Set((await a.db.list<AuditRecord>('audit')).map((r) => r.id));

    await a.call('POST', '/admin/reports/rep-02/start-review');
    await a.call('PATCH', '/admin/asset-requests/req-09', { body: { status: 'IN_REVIEW' } });
    await a.call('POST', '/admin/categories', {
      body: { slug: 'audit-cat', name: { en: 'Audit Cat', id: 'Kat Audit' } },
    });
    await a.call('PATCH', '/admin/licenses/lic-mit', { body: { sortOrder: 99 } });
    await a.call('DELETE', '/admin/featured/fs-5');

    const page = await a.call<AdminAuditPage>('GET', '/admin/audit', { query: { limit: 100 } });
    const fresh = page.items.filter((r) => !before.has(r.id));
    expect(fresh.map((r) => r.action).sort()).toEqual([
      'asset_request.status_change',
      'category.create',
      'featured.delete',
      'license.update',
      'report.start_review',
    ]);
    for (const row of fresh) {
      expect(Object.keys(row).sort()).toEqual(seededKeys);
      expect(row.actorDisplayName).toBe('Aria Wijaya');
    }
    expect(
      page.items
        .slice(0, 5)
        .map((r) => r.id)
        .sort(),
    ).toEqual(fresh.map((r) => r.id).sort());
    const subject = await a.call<AdminAuditPage>('GET', '/admin/audit', {
      query: { subjectType: 'FeaturedSlot', action: 'featured.delete' },
    });
    expect(subject.items).toHaveLength(1);
    expect(subject.items[0]!.subjectId).toBe('fs-5');
  });
});

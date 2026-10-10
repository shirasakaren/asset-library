import { describe, it, expect } from 'vitest';
import type { AdminReport, AdminReportPage, DashboardResponse } from '@/lib/api/admin-types';
import type {
  AssetRecord,
  FeaturedRecord,
  NotificationRecord,
  ReportRecord,
  TagRecord,
} from '@/preview/records';
import { assetsApp, FX_OTHER, FX_PERSONA, newAudits, status } from './admin-fixtures';

type App = Awaited<ReturnType<typeof assetsApp>>;

const report = (id: string, over: Partial<ReportRecord> = {}): ReportRecord => ({
  id,
  category: 'BROKEN_ASSET',
  notes: 'The download does not open at all.',
  status: 'OPEN',
  assetId: 'a-fx-001',
  reporterId: 'u-third',
  adminNotes: null,
  action: null,
  resolvedById: null,
  createdAt: '2026-06-01T10:00:00.000Z',
  resolvedAt: null,
  ...over,
});

const reports = (): ReportRecord[] => [
  report('rep-1'),
  report('rep-2', {
    status: 'REVIEWING',
    category: 'MALICIOUS_FILE',
    assetId: 'a-fx-002',
    reporterId: FX_OTHER,
    createdAt: '2026-06-02T10:00:00.000Z',
  }),
  report('rep-3', {
    status: 'ACTIONED',
    action: 'ARCHIVE_ASSET',
    assetId: 'a-arch',
    adminNotes: 'Archived it.',
    resolvedById: FX_PERSONA,
    resolvedAt: '2026-06-03T12:00:00.000Z',
    createdAt: '2026-06-03T10:00:00.000Z',
  }),
  report('rep-4', {
    status: 'DISMISSED',
    assetId: 'a-fx-003',
    adminNotes: 'Works fine.',
    resolvedById: FX_PERSONA,
    resolvedAt: '2026-06-04T12:00:00.000Z',
    createdAt: '2026-06-04T10:00:00.000Z',
  }),
];

const reportsApp = (extra: ReportRecord[] = []) =>
  assetsApp({}, { reports: [...reports(), ...extra] });

const list = (app: App, query: Record<string, unknown> = {}) =>
  app.call<AdminReportPage>('GET', '/admin/reports', { query });
const get = (app: App, id: string) => app.call<AdminReport>('GET', `/admin/reports/${id}`);
const stored = async (app: App, id: string) =>
  (await app.db.get<ReportRecord>('reports', id)) as ReportRecord;
const asset = async (app: App, id: string) =>
  (await app.db.get<AssetRecord>('assets', id)) as AssetRecord;
const act = (app: App, id: string, body: Record<string, unknown>) =>
  app.call('POST', `/admin/reports/${id}/action`, { body });
const dismiss = (app: App, id: string, body: Record<string, unknown>) =>
  app.call('POST', `/admin/reports/${id}/dismiss`, { body });
const fresh = () => ({ confirm: 'I understand', confirmedAt: '2026-06-10T11:59:30.000Z' });

describe('GET /admin/reports', () => {
  it('lists newest first with the AdminReport row shape', async () => {
    const app = await reportsApp();
    const page = await list(app);
    expect(page.items.map((r) => r.id)).toEqual(['rep-4', 'rep-3', 'rep-2', 'rep-1']);
    expect(page.pageInfo).toEqual({ nextCursor: null, hasMore: false });
    expect(page.items.find((r) => r.id === 'rep-2')).toEqual({
      id: 'rep-2',
      category: 'MALICIOUS_FILE',
      notes: 'The download does not open at all.',
      status: 'REVIEWING',
      assetId: 'a-fx-002',
      assetTitle: 'Fixture Item 002',
      assetSlug: 'fx-002',
      reporter: { id: FX_OTHER, displayName: 'Kenji Matsuda', email: 'kenji@example.test' },
      adminNotes: null,
      createdAt: '2026-06-02T10:00:00.000Z',
      resolvedAt: null,
    });
    expect(page.items.find((r) => r.id === 'rep-3')).toMatchObject({
      status: 'ACTIONED',
      adminNotes: 'Archived it.',
      resolvedAt: '2026-06-03T12:00:00.000Z',
    });
  });

  it('filters by status and category as the page sends them', async () => {
    const app = await reportsApp();
    const ids = async (q: Record<string, unknown>) => (await list(app, q)).items.map((r) => r.id);
    expect(await ids({ status: 'OPEN' })).toEqual(['rep-1']);
    expect(await ids({ status: 'REVIEWING' })).toEqual(['rep-2']);
    expect(await ids({ status: 'ACTIONED' })).toEqual(['rep-3']);
    expect(await ids({ status: 'DISMISSED' })).toEqual(['rep-4']);
    expect(await ids({ category: 'MALICIOUS_FILE' })).toEqual(['rep-2']);
    expect(await ids({ status: undefined, cursor: undefined, limit: 50 })).toHaveLength(4);
    await expect(list(app, { status: 'NOPE' })).rejects.toSatisfy(status(400));
    await expect(list(app, { category: 'NOPE' })).rejects.toSatisfy(status(400));
  });

  it('pages with a cursor, once each', async () => {
    const app = await reportsApp();
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < 5; i += 1) {
      const page = await list(app, { limit: 3, cursor });
      seen.push(...page.items.map((r) => r.id));
      if (!page.pageInfo.hasMore) break;
      cursor = page.pageInfo.nextCursor!;
    }
    expect(seen).toEqual(['rep-4', 'rep-3', 'rep-2', 'rep-1']);
  });

  it('maps a report whose asset was force-deleted to a placeholder instead of throwing', async () => {
    const app = await reportsApp([report('rep-5', { assetId: 'a-purged-away' })]);
    const row = (await list(app)).items.find((r) => r.id === 'rep-5')!;
    expect(row.assetTitle).toBe('(deleted asset)');
    expect(row.assetSlug).toBe('');
    expect(row.assetId).toBe('a-purged-away');
    expect(await get(app, 'rep-5')).toMatchObject({ assetTitle: '(deleted asset)', assetSlug: '' });
  });

  it('keeps the report of an asset that the 11a force delete removed', async () => {
    const app = await reportsApp();
    await app.call('POST', '/admin/assets/a-fx-001/force-delete', {
      body: { ...fresh(), reason: 'Legal takedown' },
    });
    const page = await list(app);
    expect(page.items).toHaveLength(4);
    expect(page.items.find((r) => r.id === 'rep-1')).toMatchObject({
      assetTitle: '(deleted asset)',
      assetSlug: '',
    });
  });

  it('shows a placeholder for a reporter that no longer exists', async () => {
    const app = await reportsApp([report('rep-6', { reporterId: 'u-ghost' })]);
    expect((await get(app, 'rep-6')).reporter).toEqual({
      id: 'u-ghost',
      displayName: '(unknown)',
      email: null,
    });
  });

  it('still lists the report of a soft-deleted asset with its own title', async () => {
    const app = await reportsApp([report('rep-7', { assetId: 'a-gone' })]);
    expect((await get(app, 'rep-7')).assetTitle).toBe('Gone Beta');
  });
});

describe('GET /admin/reports/{id}', () => {
  it('returns the same shape as a list row', async () => {
    const app = await reportsApp();
    const page = await list(app);
    for (const row of page.items) expect(await get(app, row.id)).toEqual(row);
  });

  it('is a 404 for an unknown id', async () => {
    const app = await reportsApp();
    await expect(get(app, 'rep-nope')).rejects.toSatisfy(status(404, 'report.not_found'));
  });
});

describe('POST /admin/reports/{id}/start-review', () => {
  it('moves OPEN to REVIEWING and audits it', async () => {
    const app = await reportsApp();
    const res = await app.call('POST', '/admin/reports/rep-1/start-review');
    expect(res).toBeUndefined();
    expect((await stored(app, 'rep-1')).status).toBe('REVIEWING');
    expect((await get(app, 'rep-1')).status).toBe('REVIEWING');
    const rows = await newAudits(app);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: 'report.start_review',
      subjectType: 'Report',
      subjectId: 'rep-1',
      actorId: FX_PERSONA,
      metadata: { assetId: 'a-fx-001' },
      createdAt: '2026-06-10T12:00:00.000Z',
    });
  });

  it('is a 409 for every other status and writes nothing', async () => {
    const app = await reportsApp();
    for (const id of ['rep-2', 'rep-3', 'rep-4']) {
      await expect(app.call('POST', `/admin/reports/${id}/start-review`)).rejects.toSatisfy(
        status(409, 'report.invalid_transition'),
      );
    }
    expect((await stored(app, 'rep-2')).status).toBe('REVIEWING');
    expect(await newAudits(app)).toEqual([]);
  });

  it('is a 404 for an unknown report', async () => {
    const app = await reportsApp();
    await expect(app.call('POST', '/admin/reports/nope/start-review')).rejects.toSatisfy(
      status(404, 'report.not_found'),
    );
  });

  it('lowers pendingReports on the dashboard only when the report leaves OPEN/REVIEWING', async () => {
    const app = await reportsApp();
    const pending = async () =>
      (await app.call<DashboardResponse>('GET', '/admin/dashboard')).counts.pendingReports;
    expect(await pending()).toBe(2);
    await app.call('POST', '/admin/reports/rep-1/start-review');
    expect(await pending()).toBe(2);
    await dismiss(app, 'rep-1', { adminNotes: 'Not a problem.' });
    expect(await pending()).toBe(1);
  });
});

describe('POST /admin/reports/{id}/action', () => {
  it('NOTHING resolves the report and leaves the asset alone', async () => {
    const app = await reportsApp();
    await act(app, 'rep-1', { adminNotes: 'Looked, all fine.', action: 'NOTHING' });
    expect(await stored(app, 'rep-1')).toMatchObject({
      status: 'ACTIONED',
      action: 'NOTHING',
      adminNotes: 'Looked, all fine.',
      resolvedById: FX_PERSONA,
      resolvedAt: '2026-06-10T12:00:00.000Z',
    });
    expect((await asset(app, 'a-fx-001')).status).toBe('PUBLISHED');
    const rows = await newAudits(app);
    expect(rows.map((r) => r.action)).toEqual(['report.action']);
    expect(rows[0]).toMatchObject({
      subjectType: 'Report',
      subjectId: 'rep-1',
      metadata: { action: 'NOTHING', assetId: 'a-fx-001' },
    });
    expect(await app.db.list<NotificationRecord>('notifications')).toEqual([]);
  });

  it('also resolves a report that is under review', async () => {
    const app = await reportsApp();
    await act(app, 'rep-2', { adminNotes: 'Scanned, clean.', action: 'NOTHING' });
    expect((await stored(app, 'rep-2')).status).toBe('ACTIONED');
  });

  it('ARCHIVE_ASSET archives the published asset and audits both changes', async () => {
    const app = await reportsApp();
    const events: unknown[] = [];
    const emit = app.ctx.emit;
    app.ctx.emit = (e) => {
      events.push(e);
      emit(e);
    };
    await act(app, 'rep-1', { adminNotes: 'Archived pending a fix.', action: 'ARCHIVE_ASSET' });
    expect((await asset(app, 'a-fx-001')).status).toBe('ARCHIVED');
    expect(await stored(app, 'rep-1')).toMatchObject({
      status: 'ACTIONED',
      action: 'ARCHIVE_ASSET',
    });
    expect(events).toContainEqual({ type: 'assets.changed' });
    const rows = await newAudits(app);
    expect(rows.map((r) => r.action).sort()).toEqual(['asset.admin_archive', 'report.action']);
    const archive = rows.find((r) => r.action === 'asset.admin_archive')!;
    expect(archive).toMatchObject({ subjectType: 'Asset', subjectId: 'a-fx-001' });
    expect(archive.metadata).toMatchObject({ previousStatus: 'PUBLISHED' });
    expect(String(archive.metadata?.reason)).toContain('report:rep-1');
  });

  it('ARCHIVE_ASSET on an asset that is already archived resolves the report', async () => {
    const app = await reportsApp([report('rep-8', { assetId: 'a-arch' })]);
    await act(app, 'rep-8', { adminNotes: 'Already archived.', action: 'ARCHIVE_ASSET' });
    expect((await stored(app, 'rep-8')).status).toBe('ACTIONED');
    expect((await asset(app, 'a-arch')).status).toBe('ARCHIVED');
  });

  it('DELETE_ASSET soft-deletes the asset and releases its tags', async () => {
    const app = await reportsApp([report('rep-9', { assetId: 'a-mine' })]);
    const lava = (await app.db.get<TagRecord>('tags', 'tag-lava'))!.usageCount;
    await act(app, 'rep-9', { adminNotes: 'Removing it.', action: 'DELETE_ASSET' });
    expect((await asset(app, 'a-mine')).status).toBe('DELETED');
    expect((await app.db.get<TagRecord>('tags', 'tag-lava'))!.usageCount).toBe(lava - 1);
    expect((await stored(app, 'rep-9')).action).toBe('DELETE_ASSET');
    expect((await newAudits(app)).map((r) => r.action).sort()).toEqual([
      'asset.admin_delete',
      'report.action',
    ]);
  });

  it('FORCE_DELETE_ASSET needs a fresh confirmation, then purges the asset and keeps the report', async () => {
    const app = await reportsApp();
    const body = { adminNotes: 'Legal takedown.', action: 'FORCE_DELETE_ASSET' };
    await expect(act(app, 'rep-1', body)).rejects.toSatisfy(status(400, 'confirmation.required'));
    await expect(
      act(app, 'rep-1', {
        ...body,
        confirm: 'I understand',
        confirmedAt: '2026-06-10T11:50:00.000Z',
      }),
    ).rejects.toSatisfy(status(400, 'confirmation.expired'));
    expect((await stored(app, 'rep-1')).status).toBe('OPEN');
    expect(await app.db.get('assets', 'a-fx-001')).toBeDefined();

    await act(app, 'rep-1', { ...body, ...fresh() });
    expect(await app.db.get('assets', 'a-fx-001')).toBeUndefined();
    expect(await stored(app, 'rep-1')).toMatchObject({
      status: 'ACTIONED',
      action: 'FORCE_DELETE_ASSET',
    });
    expect((await newAudits(app)).map((r) => r.action).sort()).toEqual([
      'asset.force_delete',
      'report.action',
    ]);
    // the orphaned report still reads cleanly
    expect(await get(app, 'rep-1')).toMatchObject({ assetTitle: '(deleted asset)' });
  });

  it('removes the featured slot of a force-deleted asset', async () => {
    const slot: FeaturedRecord = {
      id: 'fs-x',
      assetId: 'a-fx-001',
      customBannerKey: null,
      customBannerUrl: null,
      customTitle: null,
      customShortDescription: null,
      sortOrder: 1,
      isActive: true,
      createdAt: '2026-05-01T00:00:00.000Z',
      updatedAt: '2026-05-01T00:00:00.000Z',
    };
    const app = await assetsApp({}, { reports: reports(), featured: [slot] });
    await act(app, 'rep-1', {
      adminNotes: 'Legal takedown.',
      action: 'FORCE_DELETE_ASSET',
      ...fresh(),
    });
    expect(await app.db.get('featured', 'fs-x')).toBeUndefined();
  });

  it('keeps the report unresolved when the asset effect fails (atomic)', async () => {
    const app = await reportsApp([
      report('rep-10', { assetId: 'a-draft' }),
      report('rep-11', { assetId: 'a-missing' }),
      report('rep-12', { assetId: 'a-fx-002' }),
    ]);
    // a draft cannot be archived (asset.archive_blocked)
    await expect(
      act(app, 'rep-10', { adminNotes: 'Archive it.', action: 'ARCHIVE_ASSET' }),
    ).rejects.toSatisfy(status(400, 'asset.archive_blocked'));
    // an asset that is gone cannot be archived or soft-deleted
    for (const action of ['ARCHIVE_ASSET', 'DELETE_ASSET']) {
      await expect(act(app, 'rep-11', { adminNotes: 'Do it.', action })).rejects.toSatisfy(
        status(404, 'asset.not_found'),
      );
    }
    for (const id of ['rep-10', 'rep-11']) {
      expect(await stored(app, id)).toMatchObject({
        status: 'OPEN',
        action: null,
        adminNotes: null,
        resolvedAt: null,
        resolvedById: null,
      });
    }
    expect((await asset(app, 'a-draft')).status).toBe('DRAFT');
    expect(await newAudits(app)).toEqual([]);
  });

  it('resolves a report whose asset is gone with NOTHING or FORCE_DELETE_ASSET', async () => {
    const app = await reportsApp([
      report('rep-11', { assetId: 'a-missing' }),
      report('rep-13', { assetId: 'a-missing-2' }),
    ]);
    await act(app, 'rep-11', { adminNotes: 'Nothing left.', action: 'NOTHING' });
    await act(app, 'rep-13', { adminNotes: 'Gone.', action: 'FORCE_DELETE_ASSET', ...fresh() });
    expect((await stored(app, 'rep-11')).status).toBe('ACTIONED');
    expect((await stored(app, 'rep-13')).status).toBe('ACTIONED');
  });

  it('validates the body and reports every problem at once', async () => {
    const app = await reportsApp();
    const bad = (await act(app, 'rep-1', { adminNotes: 'no', action: 'EXPLODE' }).catch(
      (e) => e,
    )) as { fields: { path: string }[] };
    expect(status(400)(bad)).toBe(true);
    expect(bad.fields.map((f: { path: string }) => f.path).sort()).toEqual([
      'action',
      'adminNotes',
    ]);
    await expect(act(app, 'rep-1', { action: 'NOTHING' })).rejects.toSatisfy(status(400));
    await expect(
      act(app, 'rep-1', { action: 'NOTHING', adminNotes: 'x'.repeat(1001) }),
    ).rejects.toSatisfy(status(400));
    await expect(act(app, 'rep-1', undefined as never)).rejects.toSatisfy(status(400));
    expect((await stored(app, 'rep-1')).status).toBe('OPEN');
  });

  it('is a 404 for an unknown report and a 409 for an already resolved one', async () => {
    const app = await reportsApp();
    await expect(
      act(app, 'nope', { adminNotes: 'Anything.', action: 'NOTHING' }),
    ).rejects.toSatisfy(status(404, 'report.not_found'));
    for (const id of ['rep-3', 'rep-4']) {
      await expect(act(app, id, { adminNotes: 'Again.', action: 'NOTHING' })).rejects.toSatisfy(
        status(409, 'report.invalid_transition'),
      );
    }
    expect(await newAudits(app)).toEqual([]);
  });

  it('does not notify anybody (the backend only fans out when a report is created)', async () => {
    const app = await reportsApp([report('rep-14', { assetId: 'a-mine' })]);
    await act(app, 'rep-14', { adminNotes: 'Archived.', action: 'ARCHIVE_ASSET' });
    expect(await app.db.list('notifications')).toEqual([]);
  });
});

describe('POST /admin/reports/{id}/dismiss', () => {
  it('dismisses an open or reviewing report with the notes', async () => {
    const app = await reportsApp();
    await dismiss(app, 'rep-1', { adminNotes: 'Not an issue.' });
    await dismiss(app, 'rep-2', { adminNotes: 'False positive.' });
    expect(await stored(app, 'rep-1')).toMatchObject({
      status: 'DISMISSED',
      adminNotes: 'Not an issue.',
      action: null,
      resolvedById: FX_PERSONA,
      resolvedAt: '2026-06-10T12:00:00.000Z',
    });
    expect((await stored(app, 'rep-2')).status).toBe('DISMISSED');
    const rows = await newAudits(app);
    expect(rows.map((r) => [r.action, r.subjectId, r.metadata])).toEqual([
      ['report.dismiss', 'rep-1', { assetId: 'a-fx-001' }],
      ['report.dismiss', 'rep-2', { assetId: 'a-fx-002' }],
    ]);
    expect((await get(app, 'rep-1')).resolvedAt).toBe('2026-06-10T12:00:00.000Z');
  });

  it('works for a report whose asset is gone', async () => {
    const app = await reportsApp([report('rep-5', { assetId: 'a-missing' })]);
    await dismiss(app, 'rep-5', { adminNotes: 'Asset is gone.' });
    expect((await stored(app, 'rep-5')).status).toBe('DISMISSED');
  });

  it('validates notes, rejects resolved reports and unknown ids', async () => {
    const app = await reportsApp();
    await expect(dismiss(app, 'rep-1', {})).rejects.toSatisfy(status(400));
    await expect(dismiss(app, 'rep-1', { adminNotes: 'abc' })).rejects.toSatisfy(status(400));
    await expect(dismiss(app, 'rep-3', { adminNotes: 'Again.' })).rejects.toSatisfy(
      status(409, 'report.invalid_transition'),
    );
    await expect(dismiss(app, 'rep-4', { adminNotes: 'Again.' })).rejects.toSatisfy(
      status(409, 'report.invalid_transition'),
    );
    await expect(dismiss(app, 'nope', { adminNotes: 'Anything.' })).rejects.toSatisfy(
      status(404, 'report.not_found'),
    );
    expect((await stored(app, 'rep-1')).status).toBe('OPEN');
    expect(await newAudits(app)).toEqual([]);
  });
});

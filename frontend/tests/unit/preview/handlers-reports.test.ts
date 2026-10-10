import { describe, it, expect } from 'vitest';
import { notifyPersonaOfReport } from '@/preview/handlers/reports';
import type { NotificationRecord, ReportRecord } from '@/preview/records';
import { appWith, status } from './social-fixtures';
import { FX_OTHER, FX_PERSONA, T, withUsers } from './community-fixtures';

describe('POST /reports', () => {
  const body = { assetId: 'a-fx-001', category: 'BROKEN_ASSET', notes: 'Textures are missing.' };

  it('creates an OPEN report the admin list can read and returns its id', async () => {
    const app = await appWith([], {}, withUsers());
    const r = await app.call<{ id: string }>('POST', '/reports', { body });
    expect(r.id).toBeTruthy();
    const stored = await app.db.get<ReportRecord>('reports', r.id);
    expect(stored).toEqual({
      id: r.id,
      category: 'BROKEN_ASSET',
      notes: 'Textures are missing.',
      status: 'OPEN',
      assetId: 'a-fx-001',
      reporterId: FX_PERSONA,
      adminNotes: null,
      action: null,
      resolvedById: null,
      createdAt: expect.stringMatching(/^\d{4}-\d\d-\d\dT/),
      resolvedAt: null,
    });
  });

  it('resolves a slug to the asset id', async () => {
    const app = await appWith([], {}, withUsers());
    const r = await app.call<{ id: string }>('POST', '/reports', {
      body: { ...body, assetId: 'fx-002' },
    });
    expect((await app.db.get<ReportRecord>('reports', r.id))!.assetId).toBe('a-fx-002');
  });

  it('allows reporting the same asset again (the backend has no duplicate rule)', async () => {
    const app = await appWith([], {}, withUsers());
    await app.call('POST', '/reports', { body });
    await app.call('POST', '/reports', { body });
    expect(await app.db.list('reports')).toHaveLength(2);
  });

  const bad: Array<[string, unknown, string]> = [
    ['no body', undefined, 'assetId'],
    ['missing assetId', { ...body, assetId: undefined }, 'assetId'],
    ['assetId not a string', { ...body, assetId: 7 }, 'assetId'],
    ['unknown category', { ...body, category: 'SPAM' }, 'category'],
    ['missing category', { ...body, category: undefined }, 'category'],
    ['short notes', { ...body, notes: 'abc' }, 'notes'],
    ['missing notes', { ...body, notes: undefined }, 'notes'],
    ['oversize notes', { ...body, notes: 'a'.repeat(1001) }, 'notes'],
  ];
  it.each(bad)('rejects %s with a 400 and a field entry', async (_n, b, path) => {
    const app = await appWith([], {}, withUsers());
    const err = await app.call('POST', '/reports', { body: b }).catch((e: unknown) => e);
    expect(err).toSatisfy(status(400));
    expect((err as { fields: Array<{ path: string }> }).fields.map((f) => f.path)).toContain(path);
    expect(await app.db.list('reports')).toHaveLength(0);
  });

  it('answers 404 for unknown and deleted assets, and drafts the viewer cannot open', async () => {
    const app = await appWith([], {}, withUsers());
    for (const assetId of ['a-nope', 'a-gone']) {
      await expect(app.call('POST', '/reports', { body: { ...body, assetId } })).rejects.toSatisfy(
        status(404, 'asset.not_found'),
      );
    }
    const plain = await appWith([], { meId: 'u-third' }, withUsers());
    await expect(
      plain.call('POST', '/reports', { body: { ...body, assetId: 'a-draft' } }),
    ).rejects.toSatisfy(status(404, 'asset.not_found'));
    // the admin persona may report a draft
    await app.call('POST', '/reports', { body: { ...body, assetId: 'a-draft' } });
  });

  it('creates no notification when the persona is the reporter, and no audit row', async () => {
    const app = await appWith([], {}, withUsers());
    await app.call('POST', '/reports', { body: { ...body, assetId: 'a-mine' } });
    expect(await app.db.list('notifications')).toHaveLength(0);
    expect(await app.db.list('audit')).toHaveLength(0);
  });
});

describe('notifyPersonaOfReport', () => {
  const asset = { id: 'a-mine', slug: 'mine', title: 'My Own Asset', ownerId: FX_PERSONA };
  const report = (over: Partial<ReportRecord> = {}): ReportRecord => ({
    id: 'rep-x',
    category: 'MALICIOUS_FILE',
    notes: 'bad',
    status: 'OPEN',
    assetId: 'a-mine',
    reporterId: FX_OTHER,
    adminNotes: null,
    action: null,
    resolvedById: null,
    createdAt: T(1),
    resolvedAt: null,
    ...over,
  });
  const reporter = { id: FX_OTHER, displayName: 'Kenji Matsuda' };

  it('sends both notifications when the persona owns the asset and is an admin', async () => {
    const app = await appWith([], {}, withUsers());
    const ids = await notifyPersonaOfReport(app.ctx, { report: report(), asset, reporter });
    expect(ids).toHaveLength(2);
    const rows = await app.db.list<NotificationRecord>('notifications');
    expect(rows.map((n) => n.type).sort()).toEqual([
      'REPORT_CREATED',
      'REPORT_RECEIVED_FOR_YOUR_ASSET',
    ]);
    const created = rows.find((n) => n.type === 'REPORT_CREATED')!;
    expect(created.payload).toMatchObject({
      reportId: 'rep-x',
      assetId: 'a-mine',
      assetSlug: 'mine',
      assetTitle: 'My Own Asset',
      category: 'MALICIOUS_FILE',
    });
    expect(created.readAt).toBeNull();
  });

  it('sends only REPORT_CREATED for an admin persona who does not own the asset', async () => {
    const app = await appWith([], {}, withUsers());
    const ids = await notifyPersonaOfReport(app.ctx, {
      report: report(),
      asset: { ...asset, ownerId: FX_OTHER },
      reporter: { id: 'u-third', displayName: 'Siti' },
    });
    expect(ids).toHaveLength(1);
    expect((await app.db.list<NotificationRecord>('notifications'))[0]!.type).toBe(
      'REPORT_CREATED',
    );
  });

  it('sends only the owner notification to a non-admin persona, nothing when they are the reporter', async () => {
    const plain = await appWith([], { meId: 'u-third' }, withUsers());
    const ids = await notifyPersonaOfReport(plain.ctx, {
      report: report(),
      asset: { ...asset, ownerId: 'u-third' },
      reporter,
    });
    expect(ids).toHaveLength(1);
    expect((await plain.db.list<NotificationRecord>('notifications'))[0]!.type).toBe(
      'REPORT_RECEIVED_FOR_YOUR_ASSET',
    );
    expect(
      await notifyPersonaOfReport(plain.ctx, {
        report: report({ reporterId: 'u-third' }),
        asset: { ...asset, ownerId: 'u-third' },
        reporter: { id: 'u-third', displayName: 'Siti' },
      }),
    ).toEqual([]);
  });
});

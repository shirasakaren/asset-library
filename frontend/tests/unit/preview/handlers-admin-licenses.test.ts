import { describe, expect, it } from 'vitest';
import type { AdminLicense } from '@/lib/api/admin-types';
import type { LicenseSummary } from '@/lib/api/types';
import type { AssetRecord, LicenseRecord } from '@/preview/records';
import { assetsApp, newAudits, status } from './admin-fixtures';

type App = Awaited<ReturnType<typeof assetsApp>>;

const list = (app: App) => app.call<AdminLicense[]>('GET', '/admin/licenses');
const create = (app: App, body: Record<string, unknown>) =>
  app.call<AdminLicense>('POST', '/admin/licenses', { body });
const update = (app: App, id: string, body: Record<string, unknown>) =>
  app.call<AdminLicense>('PATCH', `/admin/licenses/${id}`, { body });
const remove = (app: App, id: string) => app.call('DELETE', `/admin/licenses/${id}`);
const pub = (app: App, locale: 'en' | 'id' = 'en') =>
  app.call<LicenseSummary[]>('GET', '/licenses', { locale });
const stored = async (app: App, id: string) =>
  (await app.db.get<LicenseRecord>('licenses', id)) as LicenseRecord;
const ids = (rows: Array<{ id: string }>) => rows.map((r) => r.id);

const body = (over: Record<string, unknown> = {}) => ({
  slug: 'bsd-3',
  name: 'BSD 3-Clause',
  description: { en: 'Permissive, with an endorsement clause.', id: 'Permisif.' },
  fullText: { en: 'BSD full text', id: 'Teks BSD' },
  isActive: true,
  ...over,
});

describe('GET /admin/licenses', () => {
  it('lists every license with the AdminLicense shape and asset counts', async () => {
    const app = await assetsApp();
    const rows = await list(app);
    expect(ids(rows)).toEqual(['lic-mit', 'lic-cc0']);
    expect(rows[1]).toEqual({
      id: 'lic-cc0',
      slug: 'cc0',
      name: 'CC0 1.0 Universal',
      description: { en: 'Public domain.', id: 'Domain publik.' },
      fullText: { en: 'CC0 full text', id: 'Teks lengkap CC0' },
      sortOrder: 20,
      isActive: true,
      assetCount: 1,
      createdAt: '2025-01-15T00:00:00.000Z',
      updatedAt: '2025-01-15T00:00:00.000Z',
    });
    // mit: fx-001, fx-003, a-mine, a-arch, a-draft (a-gone is deleted)
    expect(rows[0]!.assetCount).toBe(5);
  });

  it('puts inactive licenses last', async () => {
    const app = await assetsApp();
    await update(app, 'lic-mit', { isActive: false });
    expect(ids(await list(app))).toEqual(['lic-cc0', 'lic-mit']);
  });
});

describe('POST /admin/licenses', () => {
  it('creates a license at the end and audits it', async () => {
    const app = await assetsApp();
    const res = await create(app, body());
    expect(res).toEqual({
      id: 'lic-bsd-3',
      slug: 'bsd-3',
      name: 'BSD 3-Clause',
      description: { en: 'Permissive, with an endorsement clause.', id: 'Permisif.' },
      fullText: { en: 'BSD full text', id: 'Teks BSD' },
      sortOrder: 21,
      isActive: true,
      assetCount: 0,
      createdAt: '2026-06-10T12:00:00.000Z',
      updatedAt: '2026-06-10T12:00:00.000Z',
    });
    const rows = await newAudits(app);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: 'license.create',
      subjectType: 'License',
      subjectId: 'lic-bsd-3',
      metadata: { slug: 'bsd-3' },
    });
  });

  it('shows up on /licenses with the localized description, only while active', async () => {
    const app = await assetsApp();
    await create(app, body({ sortOrder: 5 }));
    expect((await pub(app, 'id'))[0]).toEqual({
      id: 'lic-bsd-3',
      slug: 'bsd-3',
      name: 'BSD 3-Clause',
      description: 'Permisif.',
      sortOrder: 5,
    });
    const detail = await app.call<{ fullText: string }>('GET', '/licenses/bsd-3', { locale: 'id' });
    expect(detail.fullText).toBe('Teks BSD');
    await update(app, 'lic-bsd-3', { isActive: false });
    expect(ids(await pub(app))).toEqual(['lic-mit', 'lic-cc0']);
  });

  it('refuses a slug that is already taken with 409 license.in_use', async () => {
    const app = await assetsApp();
    await expect(create(app, body({ slug: 'mit' }))).rejects.toSatisfy(
      status(409, 'license.in_use'),
    );
    expect(await list(app)).toHaveLength(2);
    expect(await newAudits(app)).toEqual([]);
  });

  it('accepts empty texts (the form sends the English one for a blank Indonesian one)', async () => {
    const app = await assetsApp();
    const res = await create(
      app,
      body({ description: { en: 'Only English', id: '' }, fullText: { en: 'Text', id: '' } }),
    );
    expect(res.description).toEqual({ en: 'Only English', id: '' });
    // ... and the public list falls back to the English text for Indonesian
    expect((await pub(app, 'id')).find((l) => l.id === 'lic-bsd-3')!.description).toBe(
      'Only English',
    );
  });

  it('validates the body', async () => {
    const app = await assetsApp();
    for (const bad of [
      {},
      body({ slug: 'Bad Slug' }),
      body({ slug: '' }),
      body({ name: '' }),
      body({ name: 'x'.repeat(141) }),
      body({ description: 'text' }),
      body({ description: { en: 'only en' } }),
      body({ fullText: { en: 5, id: 'x' } }),
      body({ sortOrder: -1 }),
      body({ isActive: 'true' }),
    ]) {
      await expect(create(app, bad), JSON.stringify(bad)).rejects.toSatisfy(status(400));
    }
    expect(await list(app)).toHaveLength(2);
  });
});

describe('PATCH /admin/licenses/{id}', () => {
  it('edits the name and merges the localized texts', async () => {
    const app = await assetsApp();
    const res = await update(app, 'lic-cc0', {
      name: 'CC0 Public Domain',
      description: { en: 'No rights reserved.' },
      fullText: { id: 'Teks baru' },
    });
    expect(res).toMatchObject({
      name: 'CC0 Public Domain',
      description: { en: 'No rights reserved.', id: 'Domain publik.' },
      fullText: { en: 'CC0 full text', id: 'Teks baru' },
      updatedAt: '2026-06-10T12:00:00.000Z',
      createdAt: '2025-01-15T00:00:00.000Z',
    });
    const rows = await newAudits(app);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: 'license.update',
      subjectType: 'License',
      subjectId: 'lic-cc0',
      metadata: { fields: ['name', 'description', 'fullText'] },
    });
  });

  it('ignores the slug the edit modal sends (the slug is fixed after creation)', async () => {
    const app = await assetsApp();
    const res = await update(app, 'lic-cc0', {
      slug: 'something-else',
      name: 'CC0 1.0 Universal',
      description: { en: 'Public domain.', id: 'Domain publik.' },
      fullText: { en: 'CC0 full text', id: 'Teks lengkap CC0' },
      isActive: false,
    });
    expect(res.slug).toBe('cc0');
    expect(res.isActive).toBe(false);
    expect((await newAudits(app))[0]!.metadata).toEqual({ fields: ['isActive'] });
  });

  it('changes sort order and reaches /licenses at once', async () => {
    const app = await assetsApp();
    await update(app, 'lic-cc0', { sortOrder: 1 });
    expect(ids(await pub(app))).toEqual(['lic-cc0', 'lic-mit']);
    expect((await stored(app, 'lic-cc0')).sortOrder).toBe(1);
  });

  it('a patch that changes nothing writes and audits nothing', async () => {
    const app = await assetsApp();
    const res = await update(app, 'lic-cc0', { name: 'CC0 1.0 Universal', isActive: true });
    expect(res.updatedAt).toBe('2025-01-15T00:00:00.000Z');
    expect(await newAudits(app)).toEqual([]);
  });

  it('validates and 404s on an unknown id', async () => {
    const app = await assetsApp();
    for (const bad of [
      { name: '' },
      { name: 5 },
      { description: 'x' },
      { fullText: { en: 5 } },
      { sortOrder: 1.5 },
      { isActive: 'no' },
    ]) {
      await expect(update(app, 'lic-cc0', bad), JSON.stringify(bad)).rejects.toSatisfy(status(400));
    }
    await expect(update(app, 'lic-nope', { isActive: false })).rejects.toSatisfy(
      status(404, 'license.not_found'),
    );
  });
});

describe('DELETE /admin/licenses/{id}', () => {
  it('removes an unused license and audits it', async () => {
    const app = await assetsApp();
    await create(app, body());
    expect(await remove(app, 'lic-bsd-3')).toBeUndefined();
    expect(ids(await list(app))).toEqual(['lic-mit', 'lic-cc0']);
    const rows = await newAudits(app);
    expect(rows.map((r) => r.action)).toEqual(['license.create', 'license.delete']);
    expect(rows[1]).toMatchObject({
      subjectType: 'License',
      subjectId: 'lic-bsd-3',
      metadata: { slug: 'bsd-3' },
    });
  });

  it('is refused with 409 license.in_use while an asset uses it', async () => {
    const app = await assetsApp();
    const err = (await remove(app, 'lic-cc0').catch((e) => e)) as Error;
    expect(status(409, 'license.in_use')(err)).toBe(true);
    expect(err.message).toMatch(/1 asset/);
    expect(await app.db.get('licenses', 'lic-cc0')).toBeDefined();
    expect(await newAudits(app)).toEqual([]);
  });

  it('also counts a soft-deleted asset, and works once nothing uses the license', async () => {
    const app = await assetsApp();
    await create(app, body());
    await app.db.patch<AssetRecord>('assets', 'a-gone', { licenseId: 'lic-bsd-3' });
    expect((await list(app)).find((l) => l.id === 'lic-bsd-3')!.assetCount).toBe(0);
    await expect(remove(app, 'lic-bsd-3')).rejects.toSatisfy(status(409, 'license.in_use'));
    await app.db.patch<AssetRecord>('assets', 'a-gone', { licenseId: 'lic-mit' });
    await remove(app, 'lic-bsd-3');
    expect(await app.db.get('licenses', 'lic-bsd-3')).toBeUndefined();
  });

  it('is a 404 for an unknown license', async () => {
    const app = await assetsApp();
    await expect(remove(app, 'lic-nope')).rejects.toSatisfy(status(404, 'license.not_found'));
  });
});

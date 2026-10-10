import { beforeEach, describe, expect, it } from 'vitest';
import type { AdminFeaturedSlot } from '@/lib/api/admin-types';
import type { DiscoverResponse } from '@/lib/api/types';
import type { FeaturedRecord, NotificationRecord } from '@/preview/records';
import { notifyOwnerFeatured } from '@/preview/handlers/admin/featured';
import { getBlobStore } from '@/preview/uploads/blob-store';
import { assetsApp, FX_OTHER, FX_PERSONA, newAudits, published, status } from './admin-fixtures';

type App = Awaited<ReturnType<typeof assetsApp>>;

const slot = (id: string, assetId: string, sortOrder: number, over: Partial<FeaturedRecord> = {}) =>
  ({
    id,
    assetId,
    customBannerKey: null,
    customBannerUrl: null,
    customTitle: null,
    customShortDescription: null,
    sortOrder,
    isActive: true,
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    ...over,
  }) satisfies FeaturedRecord;

/** Five published assets: a-fx-001..003, a-mine and a-five; plus a-six, a-seven that are not featured. */
async function featuredApp(slots: FeaturedRecord[]) {
  const app = await assetsApp({}, { featured: slots });
  for (const id of ['a-five', 'a-six', 'a-seven']) {
    await app.db.put('assets', published(id, '2026-05-20T00:00:00.000Z', { title: `Extra ${id}` }));
  }
  return app;
}

/** Five ACTIVE slots, stored sortOrder 1..5 like the seed. */
const fiveSlots = () => [
  slot('fs-1', 'a-fx-001', 1),
  slot('fs-2', 'a-fx-002', 2, { customTitle: 'Custom Two' }),
  slot('fs-3', 'a-fx-003', 3),
  slot('fs-4', 'a-mine', 4),
  slot('fs-5', 'a-five', 5),
];

const list = (app: App) => app.call<AdminFeaturedSlot[]>('GET', '/admin/featured');
const create = (app: App, body: Record<string, unknown>) =>
  app.call<AdminFeaturedSlot>('POST', '/admin/featured', { body });
const update = (app: App, id: string, body: Record<string, unknown>) =>
  app.call<AdminFeaturedSlot>('PATCH', `/admin/featured/${id}`, { body });
const remove = (app: App, id: string) => app.call('DELETE', `/admin/featured/${id}`);
const reorder = (app: App, body: unknown) => app.call('POST', '/admin/featured/reorder', { body });
const discover = (app: App, locale: 'en' | 'id' = 'en') =>
  app.call<DiscoverResponse>('GET', '/discover', { locale });
const stored = async (app: App, id: string) =>
  (await app.db.get<FeaturedRecord>('featured', id)) as FeaturedRecord;
const ids = (rows: Array<{ id: string }>) => rows.map((r) => r.id);

beforeEach(async () => {
  await getBlobStore().clear();
});

describe('GET /admin/featured', () => {
  it('lists active slots first by position with asset names and 0-based positions', async () => {
    const app = await featuredApp([
      ...fiveSlots().slice(0, 3),
      slot('fs-off', 'a-six', 4, { isActive: false }),
      slot('fs-4', 'a-mine', 5),
    ]);
    const rows = await list(app);
    expect(ids(rows)).toEqual(['fs-1', 'fs-2', 'fs-3', 'fs-4', 'fs-off']);
    expect(rows[1]).toEqual({
      id: 'fs-2',
      assetId: 'a-fx-002',
      assetTitle: 'Fixture Item 002',
      assetSlug: 'fx-002',
      customBannerKey: null,
      customBannerUrl: null,
      customTitle: 'Custom Two',
      customShortDescription: null,
      // stored sortOrder 2 of 1..5: the page prints "#{sortOrder + 1}", so it gets the 0-based position
      sortOrder: 1,
      isActive: true,
      createdAt: '2026-05-01T00:00:00.000Z',
      updatedAt: '2026-05-01T00:00:00.000Z',
    });
    expect(rows.map((r) => r.sortOrder)).toEqual([0, 1, 2, 3, 4]); // dense: the inactive slot comes last
  });

  it('shows a placeholder when the asset of a slot is gone', async () => {
    const app = await featuredApp([slot('fs-1', 'a-nowhere', 1)]);
    expect((await list(app))[0]).toMatchObject({ assetTitle: '(deleted asset)', assetSlug: '' });
  });
});

describe('POST /admin/featured', () => {
  it('adds an active slot at the end and audits it', async () => {
    const app = await featuredApp(fiveSlots().slice(0, 3));
    const res = await create(app, { assetId: 'a-six' });
    expect(res).toMatchObject({
      assetId: 'a-six',
      assetTitle: 'Extra a-six',
      assetSlug: 'six',
      sortOrder: 3,
      isActive: true,
      customBannerKey: null,
      customBannerUrl: null,
      customTitle: null,
      customShortDescription: null,
      createdAt: '2026-06-10T12:00:00.000Z',
      updatedAt: '2026-06-10T12:00:00.000Z',
    });
    expect(res.id).toMatch(/^fs-/);
    expect(ids(await list(app))).toEqual(['fs-1', 'fs-2', 'fs-3', res.id]);
    expect((await stored(app, res.id)).sortOrder).toBe(4);
    const rows = await newAudits(app);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: 'featured.create',
      subjectType: 'FeaturedSlot',
      subjectId: res.id,
      actorId: FX_PERSONA,
      metadata: { assetId: 'a-six' },
    });
  });

  it('stores the optional copy fields', async () => {
    const app = await featuredApp([]);
    const res = await create(app, {
      assetId: 'a-six',
      customTitle: '  Summer pick ',
      customShortDescription: { en: 'Hot stuff', id: 'Panas' },
      isActive: false,
    });
    expect(res).toMatchObject({
      customTitle: 'Summer pick',
      customShortDescription: { en: 'Hot stuff', id: 'Panas' },
      isActive: false,
      sortOrder: 0,
    });
  });

  it('rejects the 6th active slot with featured.active_cap_reached (409) and writes nothing', async () => {
    const app = await featuredApp(fiveSlots());
    await expect(create(app, { assetId: 'a-six' })).rejects.toSatisfy(
      status(409, 'featured.active_cap_reached'),
    );
    expect(await list(app)).toHaveLength(5);
    expect(await newAudits(app)).toEqual([]);
  });

  it('accepts an inactive slot beyond the cap, and a new one once a slot was deleted', async () => {
    const app = await featuredApp(fiveSlots());
    const inactive = await create(app, { assetId: 'a-six', isActive: false });
    expect(inactive.isActive).toBe(false);
    await expect(create(app, { assetId: 'a-seven' })).rejects.toSatisfy(status(409));
    await remove(app, 'fs-3');
    const added = await create(app, { assetId: 'a-seven' });
    expect(added.isActive).toBe(true);
    expect(await list(app)).toHaveLength(6);
    await expect(create(app, { assetId: 'a-fx-003' })).rejects.toSatisfy(status(409));
  });

  it('only a PUBLISHED asset can be featured, and not twice', async () => {
    const app = await featuredApp(fiveSlots().slice(0, 2));
    await expect(create(app, { assetId: 'a-arch' })).rejects.toSatisfy(
      status(400, 'featured.asset_not_published'),
    );
    await expect(create(app, { assetId: 'a-draft' })).rejects.toSatisfy(
      status(400, 'featured.asset_not_published'),
    );
    await expect(create(app, { assetId: 'a-gone' })).rejects.toSatisfy(
      status(404, 'asset.not_found'),
    );
    await expect(create(app, { assetId: 'nope' })).rejects.toSatisfy(
      status(404, 'asset.not_found'),
    );
    await expect(create(app, { assetId: 'a-fx-001' })).rejects.toSatisfy(
      status(400, 'featured.already_featured'),
    );
    expect(await list(app)).toHaveLength(2);
  });

  it('takes the asset by id only (a slug is an unknown asset)', async () => {
    const app = await featuredApp([]);
    await expect(create(app, { assetId: 'six' })).rejects.toSatisfy(status(404));
  });

  it('validates the body and reports every problem', async () => {
    const app = await featuredApp([]);
    const err = (await create(app, {
      customTitle: 'x'.repeat(141),
      customShortDescription: 'nope',
      isActive: 'yes',
    }).catch((e) => e)) as { fields: { path: string }[] };
    expect(status(400)(err)).toBe(true);
    expect(err.fields.map((f) => f.path).sort()).toEqual([
      'assetId',
      'customShortDescription',
      'customTitle',
      'isActive',
    ]);
    await expect(create(app, undefined as never)).rejects.toSatisfy(status(400));
  });

  it('turns an uploaded banner into a data URL and drops the blob', async () => {
    const app = await featuredApp([]);
    const ini = await app.call<{ putUrl: string; key: string }>(
      'POST',
      '/admin/featured/banner-uploads/initiate',
      { body: { contentType: 'image/png', bytes: 4 } },
    );
    const blobId = ini.putUrl.slice('preview://'.length);
    await getBlobStore().put(
      blobId,
      new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' }),
    );
    const res = await create(app, { assetId: 'a-six', customBannerKey: ini.key });
    expect(res.customBannerKey).toBe(ini.key);
    expect(res.customBannerUrl).toMatch(/^data:image\/png;base64,/);
    expect(await getBlobStore().get(blobId)).toBeUndefined();
    expect((await stored(app, res.id)).customBannerUrl).toBe(res.customBannerUrl);
    // /discover shows the banner
    expect((await discover(app)).featured[0]!.bannerUrl).toBe(res.customBannerUrl);
  });

  it('refuses a banner key whose upload never arrived', async () => {
    const app = await featuredApp([]);
    await expect(
      create(app, { assetId: 'a-six', customBannerKey: 'featured-banners/up_missing' }),
    ).rejects.toSatisfy(status(400));
    expect(await list(app)).toEqual([]);
  });

  it('keeps a plain banner key without an image (the thumbnail is shown)', async () => {
    const app = await featuredApp([]);
    const res = await create(app, { assetId: 'a-six', customBannerKey: 'featured/six.webp' });
    expect(res).toMatchObject({ customBannerKey: 'featured/six.webp', customBannerUrl: null });
  });
});

describe('featured notifications', () => {
  it('tells the asset owner when they are the persona and not the actor', async () => {
    const app = await featuredApp([]);
    await app.db.put(
      'assets',
      published('a-pers', '2026-05-01T00:00:00.000Z', { ownerId: FX_PERSONA }),
    );
    const asset = (await app.db.get<import('@/preview/records').AssetRecord>('assets', 'a-pers'))!;
    const s = slot('fs-n', 'a-pers', 0);
    expect(await notifyOwnerFeatured(app.ctx, { asset, slot: s, actorId: FX_OTHER })).toBeDefined();
    const rows = await app.db.list<NotificationRecord>('notifications');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      type: 'FEATURED_FEATURED',
      payload: {
        assetId: 'a-pers',
        assetSlug: 'pers',
        assetTitle: asset.title,
        featuredId: 'fs-n',
      },
    });
  });

  it('stays silent when the owner is the actor or has no inbox (every demo request)', async () => {
    const app = await featuredApp([]);
    await create(app, { assetId: 'a-mine' });
    await create(app, { assetId: 'a-six' });
    expect(await app.db.list('notifications')).toEqual([]);
    const asset = (await app.db.get<import('@/preview/records').AssetRecord>('assets', 'a-mine'))!;
    expect(
      await notifyOwnerFeatured(app.ctx, {
        asset,
        slot: slot('fs-n', 'a-mine', 0),
        actorId: FX_PERSONA,
      }),
    ).toBeUndefined();
  });
});

describe('PATCH /admin/featured/{id}', () => {
  it('updates the copy fields and audits the changed fields', async () => {
    const app = await featuredApp(fiveSlots().slice(0, 2));
    const res = await update(app, 'fs-1', {
      customTitle: 'Shiny',
      customShortDescription: { en: 'English', id: 'Indonesia' },
    });
    expect(res).toMatchObject({
      id: 'fs-1',
      customTitle: 'Shiny',
      customShortDescription: { en: 'English', id: 'Indonesia' },
      updatedAt: '2026-06-10T12:00:00.000Z',
      createdAt: '2026-05-01T00:00:00.000Z',
    });
    const rows = await newAudits(app);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: 'featured.update',
      subjectType: 'FeaturedSlot',
      subjectId: 'fs-1',
      metadata: { fields: ['customTitle', 'customShortDescription'] },
    });
  });

  it('can clear the copy fields with null and keeps what is not sent', async () => {
    const app = await featuredApp([
      slot('fs-1', 'a-fx-001', 1, {
        customTitle: 'Old',
        customShortDescription: { en: 'a', id: 'b' },
        customBannerKey: 'featured/x.webp',
        customBannerUrl: '/thumbs/x.webp',
      }),
    ]);
    await update(app, 'fs-1', { isActive: false });
    expect(await stored(app, 'fs-1')).toMatchObject({
      isActive: false,
      customTitle: 'Old',
      customBannerKey: 'featured/x.webp',
    });
    await update(app, 'fs-1', {
      customTitle: null,
      customShortDescription: null,
      customBannerKey: null,
    });
    expect(await stored(app, 'fs-1')).toMatchObject({
      customTitle: null,
      customShortDescription: null,
      customBannerKey: null,
      customBannerUrl: null,
    });
  });

  it('keeps the stored banner when the modal sends the same key again', async () => {
    const app = await featuredApp([
      slot('fs-1', 'a-fx-001', 1, {
        customBannerKey: 'featured/x.webp',
        customBannerUrl: '/thumbs/x.webp',
      }),
    ]);
    const res = await update(app, 'fs-1', {
      assetId: 'a-fx-001',
      isActive: true,
      customBannerKey: 'featured/x.webp',
      customTitle: undefined,
    });
    expect(res.customBannerUrl).toBe('/thumbs/x.webp');
  });

  it('the cap applies to re-activating a slot, not to editing an active one', async () => {
    const app = await featuredApp([
      ...fiveSlots(),
      slot('fs-off', 'a-six', 6, { isActive: false }),
    ]);
    await expect(update(app, 'fs-off', { isActive: true })).rejects.toSatisfy(
      status(409, 'featured.active_cap_reached'),
    );
    await update(app, 'fs-1', { isActive: true, customTitle: 'Still fine' });
    await update(app, 'fs-2', { isActive: false });
    expect((await update(app, 'fs-off', { isActive: true })).isActive).toBe(true);
  });

  it('deactivating a slot takes it off /discover at once', async () => {
    const app = await featuredApp(fiveSlots().slice(0, 3));
    expect(ids((await discover(app)).featured)).toEqual(['fs-1', 'fs-2', 'fs-3']);
    await update(app, 'fs-2', { isActive: false });
    expect(ids((await discover(app)).featured)).toEqual(['fs-1', 'fs-3']);
  });

  it('validates fields and is a 404 for an unknown slot', async () => {
    const app = await featuredApp(fiveSlots().slice(0, 1));
    await expect(update(app, 'fs-1', { sortOrder: -1 })).rejects.toSatisfy(status(400));
    await expect(update(app, 'fs-1', { sortOrder: 1.5 })).rejects.toSatisfy(status(400));
    await expect(update(app, 'fs-1', { isActive: 'no' })).rejects.toSatisfy(status(400));
    await expect(update(app, 'fs-1', { customTitle: 'x'.repeat(141) })).rejects.toSatisfy(
      status(400),
    );
    await expect(update(app, 'nope', { isActive: false })).rejects.toSatisfy(
      status(404, 'featured.not_found'),
    );
    expect(await newAudits(app)).toEqual([]);
  });

  it('an empty patch changes and audits nothing', async () => {
    const app = await featuredApp(fiveSlots().slice(0, 1));
    const res = await update(app, 'fs-1', {});
    expect(res.id).toBe('fs-1');
    expect((await stored(app, 'fs-1')).updatedAt).toBe('2026-05-01T00:00:00.000Z');
    expect(await newAudits(app)).toEqual([]);
  });
});

describe('DELETE /admin/featured/{id}', () => {
  it('removes the slot and not the asset, and audits it', async () => {
    const app = await featuredApp(fiveSlots().slice(0, 3));
    expect(await remove(app, 'fs-2')).toBeUndefined();
    expect(ids(await list(app))).toEqual(['fs-1', 'fs-3']);
    expect(await app.db.get('assets', 'a-fx-002')).toBeDefined();
    expect(ids((await discover(app)).featured)).toEqual(['fs-1', 'fs-3']);
    const rows = await newAudits(app);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: 'featured.delete',
      subjectType: 'FeaturedSlot',
      subjectId: 'fs-2',
    });
  });

  it('is a 404 for an unknown slot', async () => {
    const app = await featuredApp([]);
    await expect(remove(app, 'nope')).rejects.toSatisfy(status(404, 'featured.not_found'));
  });
});

describe('POST /admin/featured/reorder', () => {
  it('re-numbers the slots and /discover follows', async () => {
    const app = await featuredApp(fiveSlots());
    await reorder(app, { orderedIds: ['fs-5', 'fs-3', 'fs-1', 'fs-2', 'fs-4'] });
    expect(ids(await list(app))).toEqual(['fs-5', 'fs-3', 'fs-1', 'fs-2', 'fs-4']);
    expect((await list(app)).map((r) => r.sortOrder)).toEqual([0, 1, 2, 3, 4]);
    expect(ids((await discover(app)).featured)).toEqual(['fs-5', 'fs-3', 'fs-1', 'fs-2', 'fs-4']);
    const rows = await newAudits(app);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: 'featured.reorder',
      subjectType: 'FeaturedSlot',
      subjectId: 'fs-5',
      metadata: { order: ['fs-5', 'fs-3', 'fs-1', 'fs-2', 'fs-4'] },
    });
  });

  it('puts the listed slots first when the page sends only the active ones', async () => {
    const app = await featuredApp([
      slot('fs-1', 'a-fx-001', 1),
      slot('fs-off', 'a-six', 2, { isActive: false }),
      slot('fs-2', 'a-fx-002', 3),
      slot('fs-3', 'a-fx-003', 4),
    ]);
    await reorder(app, { orderedIds: ['fs-3', 'fs-1', 'fs-2'] });
    expect(ids(await list(app))).toEqual(['fs-3', 'fs-1', 'fs-2', 'fs-off']);
    const sorted = (await app.db.list<FeaturedRecord>('featured')).sort(
      (a, b) => a.sortOrder - b.sortOrder,
    );
    expect(ids(sorted)).toEqual(['fs-3', 'fs-1', 'fs-2', 'fs-off']);
    expect(sorted.map((s) => s.sortOrder)).toEqual([0, 1, 2, 3]);
  });

  it('validates the id list and writes nothing when it is wrong', async () => {
    const app = await featuredApp(fiveSlots().slice(0, 3));
    for (const body of [
      {},
      { orderedIds: [] },
      { orderedIds: 'fs-1' },
      { orderedIds: ['fs-1', 5] },
    ]) {
      await expect(reorder(app, body)).rejects.toSatisfy(status(400));
    }
    await expect(reorder(app, { orderedIds: ['fs-1', 'fs-1'] })).rejects.toSatisfy(status(400));
    await expect(reorder(app, { orderedIds: ['fs-1', 'fs-nope'] })).rejects.toSatisfy(
      status(404, 'featured.not_found'),
    );
    expect(ids(await list(app))).toEqual(['fs-1', 'fs-2', 'fs-3']);
    expect(await newAudits(app)).toEqual([]);
  });
});

describe('POST /admin/featured/banner-uploads/initiate', () => {
  const initiate = (app: App, body: unknown) =>
    app.call<{ putUrl: string; key: string; expiresAt: string }>(
      'POST',
      '/admin/featured/banner-uploads/initiate',
      { body },
    );

  it('hands out a preview:// PUT url, a banner key and an expiry', async () => {
    const app = await featuredApp([]);
    const res = await initiate(app, { contentType: 'image/webp', bytes: 120_000 });
    expect(res.putUrl).toMatch(/^preview:\/\/up_/);
    expect(res.key).toBe(`featured-banners/${res.putUrl.slice('preview://'.length)}`);
    expect(res.expiresAt).toBe('2026-06-10T13:00:00.000Z');
    const second = await initiate(app, { contentType: 'image/png', bytes: 1 });
    expect(second.key).not.toBe(res.key);
  });

  it('refuses images over 5 MB, non-images and malformed bodies', async () => {
    const app = await featuredApp([]);
    await expect(
      initiate(app, { contentType: 'image/png', bytes: 5 * 1024 * 1024 + 1 }),
    ).rejects.toSatisfy(status(400));
    await expect(initiate(app, { contentType: 'application/zip', bytes: 10 })).rejects.toSatisfy(
      status(400),
    );
    await expect(initiate(app, { contentType: 'image/png', bytes: -1 })).rejects.toSatisfy(
      status(400),
    );
    await expect(initiate(app, { contentType: 'image/png' })).rejects.toSatisfy(status(400));
    await expect(initiate(app, undefined)).rejects.toSatisfy(status(400));
    expect(await initiate(app, { contentType: 'image/png', bytes: 5 * 1024 * 1024 })).toBeDefined();
  });
});

describe('the carousel on /discover', () => {
  it('reflects create, delete and reorder at once, with copy overrides per locale', async () => {
    const app = await featuredApp(fiveSlots().slice(0, 2));
    const added = await create(app, {
      assetId: 'a-six',
      customTitle: 'Pick of the week',
      customShortDescription: { en: 'Fresh', id: 'Baru' },
    });
    const en = (await discover(app, 'en')).featured;
    expect(ids(en)).toEqual(['fs-1', 'fs-2', added.id]);
    expect(en[2]).toMatchObject({
      assetId: 'a-six',
      assetSlug: 'six',
      title: 'Pick of the week',
      shortDescription: 'Fresh',
      bannerUrl: '/thumbs/six.webp',
    });
    expect((await discover(app, 'id')).featured[2]!.shortDescription).toBe('Baru');
    await reorder(app, { orderedIds: [added.id, 'fs-2', 'fs-1'] });
    expect(ids((await discover(app)).featured)).toEqual([added.id, 'fs-2', 'fs-1']);
    await remove(app, added.id);
    expect(ids((await discover(app)).featured)).toEqual(['fs-2', 'fs-1']);
  });

  it('drops the slot of an asset that is no longer published (archived by a report)', async () => {
    const app = await featuredApp(fiveSlots().slice(0, 2));
    await app.call('POST', '/admin/assets/a-fx-001/archive', { body: { reason: 'Spam content' } });
    expect(ids((await discover(app)).featured)).toEqual(['fs-2']);
  });

  it('ignores slots of other owners being featured (no notification without an inbox)', async () => {
    const app = await featuredApp([]);
    await create(app, { assetId: 'a-fx-001' });
    expect(await app.db.get('assets', 'a-fx-001')).toMatchObject({ ownerId: FX_OTHER });
    expect(await app.db.list('notifications')).toEqual([]);
  });
});

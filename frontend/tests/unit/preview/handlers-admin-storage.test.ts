import { describe, it, expect } from 'vitest';
import type { AdminStorageAssetRow, AdminStorageUserRow } from '@/lib/api/admin-types';
import { fixtureAsset } from '@/preview/test-utils';
import {
  adminApp,
  FX_OTHER,
  FX_PERSONA,
  patchAsset,
  published,
  status,
  uploadedFile,
  withUploadedFile,
} from './admin-fixtures';

type App = Awaited<ReturnType<typeof adminApp>>;
const users = (app: App, query: Record<string, unknown> = {}) =>
  app.call<AdminStorageUserRow[]>('GET', '/admin/storage/users', { query });
const assets = (app: App, query: Record<string, unknown> = {}) =>
  app.call<AdminStorageAssetRow[]>('GET', '/admin/storage/assets', { query });

describe('GET /admin/storage/assets', () => {
  it('lists the rollup rows by bytes desc with slug, title, owner and a 30-day spark', async () => {
    const app = await adminApp();
    const rows = await assets(app);
    expect(rows.map((r) => r.assetId)).toEqual(['a-fx-001', 'a-fx-002', 'a-fx-003']);
    expect(rows[0]).toMatchObject({
      assetId: 'a-fx-001',
      slug: 'fx-001',
      title: 'Fixture Item 001',
      ownerDisplayName: 'Kenji Matsuda',
      bytes: 3000,
    });
    const spark = rows[0]!.spark;
    expect(spark).toHaveLength(30);
    // the default window ends today (2026-06-10); after the snapshot day the last value is carried
    expect(spark[29]).toEqual({ date: '2026-06-10', bytes: 3000 });
    expect(spark[0]).toEqual({ date: '2026-05-12', bytes: 1100 });
    expect(spark.find((p) => p.date === '2026-05-31')!.bytes).toBe(3000);
  });

  it('answers a past date from the stored spark and nothing before the series', async () => {
    const app = await adminApp();
    const rows = await assets(app, { date: '2026-05-20' });
    // 2026-05-20 is 11 days before the snapshot: index 29 - 11 = 18 -> 1900
    expect(rows.find((r) => r.assetId === 'a-fx-001')!.bytes).toBe(1900);
    expect(rows[0]!.spark[29]!.date).toBe('2026-05-20');
    expect(await assets(app, { date: '2026-03-01' })).toEqual([]);
  });

  it('treats a date after today like today and rejects garbage', async () => {
    const app = await adminApp();
    expect((await assets(app, { date: '2030-01-01' }))[0]!.spark[29]!.date).toBe('2026-06-10');
    await expect(assets(app, { date: 'not-a-date' })).rejects.toSatisfy(status(400));
    // an empty date input (the page clears it) means "now"
    expect(await assets(app, { date: '' })).toHaveLength(3);
  });

  it('applies the limit (default 50, 1..200) and breaks byte ties by id', async () => {
    const app = await adminApp();
    expect(await assets(app, { limit: 2 })).toHaveLength(2);
    expect(await assets(app, { limit: 0 })).toHaveLength(1);
    expect(await assets(app, { limit: 'abc' })).toHaveLength(3);
    expect(await assets(app, { limit: 9999 })).toHaveLength(3);
    await app.db.put('assets', published('a-b', '2026-06-01T00:00:00.000Z', { ownerId: FX_OTHER }));
    await app.db.put('assets', published('a-a', '2026-06-01T00:00:00.000Z', { ownerId: FX_OTHER }));
    const withUpload = (id: string) =>
      patchAsset(app, id, {
        versions: withUploadedFile(fixtureAsset(id), uploadedFile(`f-${id}`, 2000)).versions,
      });
    await withUpload('a-b');
    await withUpload('a-a');
    const ids = (await assets(app)).map((r) => r.assetId);
    // a-fx-001 3000, then the three 2000-byte rows in id order, then 1000
    expect(ids).toEqual(['a-fx-001', 'a-a', 'a-b', 'a-fx-002', 'a-fx-003']);
  });

  it('adds uploaded bytes of the visitor on top of the rollup, for days after the snapshot', async () => {
    const withUpload = withUploadedFile(
      published('a-fx-001-copy', '2026-06-01T00:00:00.000Z'),
      uploadedFile('f-1', 5000),
    );
    const app = await adminApp({ assets: [withUpload] });
    // an upload into a seeded asset
    const seeded = (await app.db.get('assets', 'a-fx-001')) as ReturnType<typeof fixtureAsset>;
    await app.db.put('assets', withUploadedFile(seeded, uploadedFile('f-2', 400)));

    const today = await assets(app);
    expect(today.find((r) => r.assetId === 'a-fx-001')!.bytes).toBe(3400);
    // visitor-created asset: no rollup row, its own bytes, zero before it existed
    const mine = today.find((r) => r.assetId === 'a-fx-001-copy')!;
    expect(mine.bytes).toBe(5000);
    expect(mine.spark[29]!.bytes).toBe(5000);
    expect(mine.spark[0]!.bytes).toBe(0);

    // on the snapshot day the numbers are the stored ones (uploads came later)
    const atSnapshot = await assets(app, { date: '2026-05-31' });
    expect(atSnapshot.find((r) => r.assetId === 'a-fx-001')!.bytes).toBe(3000);
    expect(atSnapshot.find((r) => r.assetId === 'a-fx-001-copy')).toBeUndefined();
  });

  it('includes DRAFT and ARCHIVED assets and leaves out DELETED ones', async () => {
    const app = await adminApp();
    await patchAsset(app, 'a-fx-001', { status: 'ARCHIVED' });
    await patchAsset(app, 'a-fx-002', { status: 'DRAFT' });
    await patchAsset(app, 'a-fx-003', { status: 'DELETED' });
    expect((await assets(app)).map((r) => r.assetId)).toEqual(['a-fx-001', 'a-fx-002']);
  });

  it('is admin-only', async () => {
    const app = await adminApp({ meId: FX_OTHER });
    await expect(assets(app)).rejects.toSatisfy(status(403));
  });
});

describe('GET /admin/storage/users', () => {
  it('derives each owner from their assets (sum of bytes and sparks)', async () => {
    const app = await adminApp();
    const rows = await users(app);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      userId: FX_OTHER,
      displayName: 'Kenji Matsuda',
      email: 'kenji@example.test',
      bytes: 6000,
    });
    expect(rows[0]!.spark).toHaveLength(30);
    // 2026-05-12: 1100 + 2000 + 1000
    expect(rows[0]!.spark[0]).toEqual({ date: '2026-05-12', bytes: 4100 });
    expect(rows[0]!.spark[29]).toEqual({ date: '2026-06-10', bytes: 6000 });
  });

  it('follows ownership: after a transfer the bytes move to the new owner', async () => {
    const app = await adminApp();
    await patchAsset(app, 'a-fx-001', { ownerId: FX_PERSONA });
    const rows = await users(app);
    expect(rows.map((r) => [r.userId, r.bytes])).toEqual([
      [FX_OTHER, 3000],
      [FX_PERSONA, 3000],
    ]);
  });

  it('includes owners of visitor-created assets and sorts by bytes desc, ties by id', async () => {
    const mine = withUploadedFile(
      published('a-mine', '2026-06-02T00:00:00.000Z', { ownerId: FX_PERSONA }),
      uploadedFile('f-m', 7000),
    );
    const app = await adminApp({ assets: [mine] });
    const rows = await users(app, { limit: 100 });
    expect(rows.map((r) => [r.userId, r.bytes])).toEqual([
      [FX_PERSONA, 7000],
      [FX_OTHER, 6000],
    ]);
  });

  it('honours date and is admin-only', async () => {
    const app = await adminApp();
    const past = await users(app, { date: '2026-05-20' });
    expect(past[0]!.bytes).toBe(1900 + 2000 + 1000);
    expect(await users(app, { date: '2026-01-01' })).toEqual([]);
    const other = await adminApp({ meId: FX_OTHER });
    await expect(users(other)).rejects.toSatisfy(status(403));
  });
});

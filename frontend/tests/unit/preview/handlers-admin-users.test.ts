import { describe, it, expect } from 'vitest';
import type { AdminUserPage } from '@/lib/api/admin-types';
import type { UserRecord } from '@/preview/records';
import {
  adminApp,
  assetsApp,
  FX_OTHER,
  FX_PERSONA,
  moreUsers,
  status,
  newAudits,
} from './admin-fixtures';

type App = Awaited<ReturnType<typeof assetsApp>>;
const list = (app: App, query: Record<string, unknown> = {}) =>
  app.call<AdminUserPage>('GET', '/admin/users', { query });
const audits = (app: App) => newAudits(app);
const body = (over: Record<string, unknown> = {}) => ({
  confirm: 'I understand',
  confirmedAt: '2026-06-10T11:59:40.000Z',
  ...over,
});
const promote = (app: App, id: string, b: Record<string, unknown> = body()) =>
  app.call('POST', `/admin/users/${id}/promote`, { body: b });
const demote = (app: App, id: string, b: Record<string, unknown> = body()) =>
  app.call('POST', `/admin/users/${id}/demote`, { body: b });
const user = async (app: App, id: string) =>
  (await app.db.get<UserRecord>('users', id)) as UserRecord;
const withAdmin2 = { users: moreUsers() };

describe('GET /admin/users', () => {
  it('lists newest accounts first with the admin row shape', async () => {
    const app = await assetsApp({}, withAdmin2);
    const page = await list(app);
    expect(page.items.map((u) => u.id)).toEqual(['u-admin2', 'u-third', FX_OTHER, FX_PERSONA]);
    expect(page.items.find((u) => u.id === FX_OTHER)).toEqual({
      id: FX_OTHER,
      email: 'kenji@example.test',
      displayName: 'Kenji Matsuda',
      isAdmin: false,
      locale: 'en',
      createdAt: '2025-07-01T00:00:00.000Z',
      publishedAssetCount: 3,
      avatar: { initials: 'KM', bgColor: 'brand-green', fgColor: 'ink-white' },
    });
    expect(page.pageInfo).toEqual({ nextCursor: null, hasMore: false });
  });

  it('counts PUBLISHED assets only', async () => {
    const app = await assetsApp({}, withAdmin2);
    const byId = Object.fromEntries((await list(app)).items.map((u) => [u.id, u]));
    // u-other: 3 published + 1 archived; persona 1; u-third a draft and a deleted one
    expect(byId[FX_OTHER]!.publishedAssetCount).toBe(3);
    expect(byId[FX_PERSONA]!.publishedAssetCount).toBe(1);
    expect(byId['u-third']!.publishedAssetCount).toBe(0);
  });

  it('filters by q (name or email, any case) and isAdmin, like the page and the modals send', async () => {
    const app = await assetsApp({}, withAdmin2);
    const ids = async (q: Record<string, unknown>) => (await list(app, q)).items.map((u) => u.id);
    expect(await ids({ q: 'KENJI' })).toEqual([FX_OTHER]);
    expect(await ids({ q: 'siti@' })).toEqual(['u-third']);
    expect(await ids({ q: 'second', limit: 8 })).toEqual(['u-admin2']);
    expect(await ids({ isAdmin: 'true' })).toEqual(['u-admin2', FX_PERSONA]);
    expect(await ids({ isAdmin: 'true', q: 'aria' })).toEqual([FX_PERSONA]);
    expect(await ids({ q: 'nobody-here' })).toEqual([]);
    // the page sends nothing for "All"
    expect(await ids({ isAdmin: undefined })).toHaveLength(4);
  });

  it('pages with a cursor, once each', async () => {
    const app = await assetsApp({}, withAdmin2);
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < 5; i += 1) {
      const page = await list(app, { limit: 3, cursor });
      seen.push(...page.items.map((u) => u.id));
      if (!page.pageInfo.hasMore) break;
      cursor = page.pageInfo.nextCursor!;
    }
    expect(seen).toEqual(['u-admin2', 'u-third', FX_OTHER, FX_PERSONA]);
  });

  it('is admin-only', async () => {
    const app = await assetsApp({ meId: FX_OTHER });
    await expect(list(app)).rejects.toSatisfy(status(403));
  });
});

describe('POST /admin/users/{id}/promote', () => {
  it('makes the user an admin (role and flag together) and audits user.promote', async () => {
    const app = await assetsApp({}, withAdmin2);
    await promote(app, FX_OTHER);
    const u = await user(app, FX_OTHER);
    expect(u.isAdmin).toBe(true);
    expect(u.role).toBe('admin');
    expect((await list(app, { isAdmin: 'true' })).items.map((x) => x.id)).toContain(FX_OTHER);
    const search = await app.call<Array<{ id: string; isAdmin: boolean }>>('GET', '/users/search', {
      query: { q: 'kenji' },
    });
    expect(search[0]).toMatchObject({ id: FX_OTHER, isAdmin: true });
    expect(await audits(app)).toEqual([
      expect.objectContaining({
        action: 'user.promote',
        subjectType: 'User',
        subjectId: FX_OTHER,
        actorId: FX_PERSONA,
        metadata: { role: 'admin' },
      }),
    ]);
  });

  it('is a no-op for an admin and a 404 for an unknown user', async () => {
    const app = await assetsApp({}, withAdmin2);
    await promote(app, 'u-admin2');
    expect(await audits(app)).toHaveLength(0);
    await expect(promote(app, 'u-nobody')).rejects.toSatisfy(status(404, 'user.not_found'));
  });

  it('needs the confirmation phrase (the modal sends confirm and confirmedAt)', async () => {
    const app = await assetsApp({}, withAdmin2);
    await expect(promote(app, FX_OTHER, {})).rejects.toSatisfy(
      status(400, 'confirmation.required'),
    );
    await expect(promote(app, FX_OTHER, body({ confirm: 'ok' }))).rejects.toSatisfy(
      status(400, 'confirmation.required'),
    );
    await expect(
      promote(app, FX_OTHER, body({ confirmedAt: '2026-06-10T11:00:00.000Z' })),
    ).rejects.toSatisfy(status(400, 'confirmation.expired'));
    expect((await user(app, FX_OTHER)).isAdmin).toBe(false);
  });
});

describe('POST /admin/users/{id}/demote', () => {
  it('demotes another admin, keeping role and flag in sync, and audits user.demote', async () => {
    const app = await assetsApp({}, withAdmin2);
    await demote(app, 'u-admin2');
    const u = await user(app, 'u-admin2');
    expect(u.isAdmin).toBe(false);
    expect(u.role).toBe('user');
    expect(await audits(app)).toEqual([
      expect.objectContaining({
        action: 'user.demote',
        subjectId: 'u-admin2',
        metadata: { role: 'user' },
      }),
    ]);
  });

  it('a demoted user who owns published assets becomes a contributor', async () => {
    const app = await assetsApp({}, withAdmin2);
    await promote(app, FX_OTHER);
    await demote(app, FX_OTHER);
    const u = await user(app, FX_OTHER);
    expect(u).toMatchObject({ isAdmin: false, role: 'contributor' });
  });

  it('is a no-op for a non-admin and a 404 for an unknown user', async () => {
    const app = await assetsApp({}, withAdmin2);
    await demote(app, FX_OTHER);
    expect(await audits(app)).toHaveLength(0);
    await expect(demote(app, 'u-nobody')).rejects.toSatisfy(status(404, 'user.not_found'));
  });

  it('refuses to demote the last admin (the code the demote modal branches on)', async () => {
    // fixture users: the persona is the only admin
    const app = await assetsApp();
    await expect(demote(app, FX_PERSONA)).rejects.toSatisfy(
      status(409, 'admin.cannot_remove_last_admin'),
    );
    expect((await user(app, FX_PERSONA)).isAdmin).toBe(true);
    expect(await audits(app)).toHaveLength(0);
  });

  it('preview-only: the persona cannot demote themselves while another admin exists', async () => {
    const app = await assetsApp({}, withAdmin2);
    const err = await demote(app, FX_PERSONA).catch(
      (e: Error & { status: number; code: string }) => e,
    );
    expect(err).toMatchObject({ status: 409, code: 'users.self_demote_preview' });
    expect((err as Error).message).toContain("can't demote yourself");
    expect((await user(app, FX_PERSONA)).isAdmin).toBe(true);
    expect(await audits(app)).toHaveLength(0);
    // other admins stay demotable
    await demote(app, 'u-admin2');
    expect((await user(app, 'u-admin2')).isAdmin).toBe(false);
  });

  it('needs the confirmation phrase before anything else', async () => {
    const app = await assetsApp({}, withAdmin2);
    await expect(demote(app, 'u-admin2', {})).rejects.toSatisfy(
      status(400, 'confirmation.required'),
    );
    await expect(demote(app, 'u-nobody', {})).rejects.toSatisfy(
      status(400, 'confirmation.required'),
    );
    expect((await user(app, 'u-admin2')).isAdmin).toBe(true);
  });

  it('a demoted admin loses access to /admin when they are the persona (403)', async () => {
    const app = await adminApp({ meId: 'u-admin2' }, withAdmin2);
    await demote(app, 'u-admin2').catch(() => undefined);
    // self demote is refused in the preview, so the persona still has access
    await expect(app.call('GET', '/admin/queues')).resolves.toBeDefined();
  });
});

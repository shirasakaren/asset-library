import { describe, it, expect } from 'vitest';
import { fixtureAsset, fixtureUsers } from '@/preview/test-utils';
import type { UserRecord } from '@/preview/records';
import { appWith, status } from './social-fixtures';
import { FX_OTHER, FX_PERSONA, withUsers } from './community-fixtures';

type App = Awaited<ReturnType<typeof appWith>>;

describe('GET /users/search', () => {
  const search = (app: App, q?: string, limit?: unknown) =>
    app.call<Array<Record<string, unknown>>>('GET', '/users/search', { query: { q, limit } });

  it('matches display name and email, case and diacritic insensitive', async () => {
    const app = await appWith([], {}, withUsers());
    expect((await search(app, 'jose')).map((u) => u.id)).toEqual(['u-jose']);
    expect((await search(app, 'ÁLVAREZ')).map((u) => u.id)).toEqual(['u-jose']);
    expect((await search(app, 'kenji@')).map((u) => u.id)).toEqual([FX_OTHER]);
    expect((await search(app, 'ari')).map((u) => u.id)).toEqual([FX_PERSONA, 'u-ari']);
  });

  it('returns the typeahead shape, admins first then by name', async () => {
    const app = await appWith([], {}, withUsers());
    const r = await search(app, 'ar');
    // "Alvarez" contains "ar" too; admins first, then display name
    expect(r.map((u) => u.id)).toEqual([FX_PERSONA, 'u-ari', 'u-jose']);
    expect(r[1]).toEqual({
      id: 'u-ari',
      email: 'ari.putra@example.test',
      displayName: 'Ari Putra',
      isAdmin: false,
    });
  });

  it('returns nothing for a missing, empty, blank or one-character query', async () => {
    const app = await appWith([], {}, withUsers());
    for (const q of [undefined, '', '   ', 'a']) expect(await search(app, q)).toEqual([]);
  });

  it('clamps the limit to 1..20 and ignores a malformed one', async () => {
    const many: UserRecord[] = Array.from({ length: 30 }, (_, i) => ({
      ...fixtureUsers()[1]!,
      id: `u-bulk-${i}`,
      email: `bulk${i}@example.test`,
      displayName: `Bulk User ${String(i).padStart(2, '0')}`,
    }));
    const app = await appWith([], {}, { users: [...fixtureUsers(), ...many] });
    expect(await search(app, 'bulk')).toHaveLength(20);
    expect(await search(app, 'bulk', 5000)).toHaveLength(20);
    expect(await search(app, 'bulk', 3)).toHaveLength(3);
    expect(await search(app, 'bulk', 0)).toHaveLength(1);
    expect(await search(app, 'bulk', 'abc')).toHaveLength(20);
  });

  it('is admin-only, like the backend', async () => {
    const app = await appWith([], { meId: 'u-third' }, withUsers());
    await expect(search(app, 'kenji')).rejects.toSatisfy(status(403));
  });
});

describe('GET /users/{id}', () => {
  // The fixture catalog gives u-other 3 PUBLISHED assets, a DRAFT (a-draft) and a DELETED one
  // (a-gone); an ARCHIVED one is added here.
  const appWithAssets = async (meId?: string) => {
    const app = await appWith([], { meId }, withUsers());
    await app.db.put('assets', fixtureAsset('a-arch', { ownerId: FX_OTHER, status: 'ARCHIVED' }));
    return app;
  };

  it('counts only PUBLISHED assets and gives an admin the email', async () => {
    const app = await appWithAssets();
    const p = await app.call<Record<string, unknown>>('GET', `/users/${FX_OTHER}`);
    expect(p).toEqual({
      id: FX_OTHER,
      displayName: 'Kenji Matsuda',
      avatar: { initials: 'KM', bgColor: 'brand-green', fgColor: 'ink-white' },
      joinedAt: '2025-07-01T00:00:00.000Z',
      publishedAssetCount: 3,
      email: 'kenji@example.test',
    });
  });

  it('hides the email from other non-admin viewers but not from the user themselves', async () => {
    const app = await appWithAssets('u-third');
    const other = await app.call<Record<string, unknown>>('GET', `/users/${FX_OTHER}`);
    expect(other).not.toHaveProperty('email');
    const self = await app.call<Record<string, unknown>>('GET', '/users/u-third');
    expect(self.email).toBe('siti@example.test');
    expect(self.publishedAssetCount).toBe(0);
  });

  it('answers 404 for an unknown user', async () => {
    const app = await appWith([], {}, withUsers());
    await expect(app.call('GET', '/users/u-nope')).rejects.toSatisfy(status(404, 'user.not_found'));
  });
});

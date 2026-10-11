import { describe, it, expect } from 'vitest';
import '@/preview/test-utils';
import { adminRoutes } from '@/preview/handlers/admin/common';
import { registeredRoutes } from '@/preview/router/router';
import { adminApp, FX_OTHER, status } from './admin-fixtures';

const concrete = (pattern: string) => pattern.replace(/\{(\w+)\}/g, 'x-id');

describe('every /admin/* route', () => {
  it('registers a meaningful number of admin routes', () => {
    expect(adminRoutes.length).toBeGreaterThanOrEqual(20);
    expect(adminRoutes.every((r) => r.pattern.startsWith('/admin/'))).toBe(true);
  });

  it('has no /admin/ route registered with a plain route() (nothing bypasses the gate)', () => {
    const key = (r: { method: string; pattern: string }) => `${r.method} ${r.pattern}`;
    const gated = new Set(adminRoutes.map(key));
    const admin = registeredRoutes().filter(
      (r) => r.pattern.startsWith('/admin/') || r.pattern === '/admin',
    );
    expect(admin.length).toBeGreaterThanOrEqual(20);
    expect(admin.filter((r) => !gated.has(key(r))).map(key)).toEqual([]);
    // and the other way round: every gated route really is registered
    const registered = new Set(registeredRoutes().map(key));
    expect(adminRoutes.filter((r) => !registered.has(key(r))).map(key)).toEqual([]);
  });

  it('is a 403 auth.forbidden for a non-admin (checked before anything else)', async () => {
    const app = await adminApp({ meId: FX_OTHER });
    for (const r of adminRoutes) {
      await expect(
        app.call(r.method, concrete(r.pattern), { body: {} }),
        `${r.method} ${r.pattern}`,
      ).rejects.toSatisfy(status(403, 'auth.forbidden'));
    }
  });

  it('is a 403 for an unknown persona id too (no user record)', async () => {
    const app = await adminApp({ meId: 'u-nobody' });
    for (const r of adminRoutes) {
      await expect(
        app.call(r.method, concrete(r.pattern), { body: {} }),
        `${r.method} ${r.pattern}`,
      ).rejects.toSatisfy(status(403));
    }
  });

  it('asks for the confirmation phrase on destructive routes, after the admin check', async () => {
    const app = await adminApp();
    const confirmed = adminRoutes.filter((r) => r.confirm);
    expect(confirmed.map((r) => `${r.method} ${r.pattern}`)).toEqual(
      expect.arrayContaining([
        'POST /admin/assets/{id}/force-delete',
        'POST /admin/users/{id}/promote',
        'POST /admin/users/{id}/demote',
      ]),
    );
    for (const r of confirmed) {
      await expect(
        app.call(r.method, concrete(r.pattern), { body: {} }),
        `${r.method} ${r.pattern}`,
      ).rejects.toSatisfy(status(400, 'confirmation.required'));
    }
  });

  /** The 11b routes, spelled out so that a route dropped from the registry cannot go unnoticed. */
  const ROUTES_11B = [
    'GET /admin/reports',
    'GET /admin/reports/{id}',
    'POST /admin/reports/{id}/start-review',
    'POST /admin/reports/{id}/action',
    'POST /admin/reports/{id}/dismiss',
    'GET /admin/asset-requests',
    'GET /admin/asset-requests/{id}',
    'PATCH /admin/asset-requests/{id}',
    'GET /admin/featured',
    'POST /admin/featured',
    'PATCH /admin/featured/{id}',
    'DELETE /admin/featured/{id}',
    'POST /admin/featured/reorder',
    'POST /admin/featured/banner-uploads/initiate',
    'GET /admin/categories',
    'POST /admin/categories',
    'PATCH /admin/categories/{id}',
    'DELETE /admin/categories/{id}',
    'POST /admin/categories/reorder',
    'POST /admin/categories/icon-uploads/initiate',
    'GET /admin/tags',
    'POST /admin/tags/merge',
    'PATCH /admin/tags/{id}',
    'DELETE /admin/tags/{id}',
    'GET /admin/licenses',
    'POST /admin/licenses',
    'PATCH /admin/licenses/{id}',
    'DELETE /admin/licenses/{id}',
    'GET /admin/av/infected',
    'POST /admin/av/{versionId}/quarantine',
    'POST /admin/av/{versionId}/acknowledge',
    'POST /admin/av/{versionId}/rescan',
    'GET /admin/webhook-deliveries',
  ];

  it('registers every 11b route through adminRoute', () => {
    const gated = new Set(adminRoutes.map((r) => `${r.method} ${r.pattern}`));
    expect(ROUTES_11B.filter((r) => !gated.has(r))).toEqual([]);
  });

  it('answers every 11b route with 403 auth.forbidden for a non-admin, even with a valid body', async () => {
    const app = await adminApp({ meId: FX_OTHER });
    const body = {
      assetId: 'a-fx-001',
      adminNotes: 'Looks fine to me.',
      action: 'NOTHING',
      status: 'APPROVED',
      orderedIds: ['x'],
      fromTagIds: ['a'],
      intoTagId: 'b',
      slug: 'ok',
      name: { en: 'A', id: 'B' },
      contentType: 'image/png',
      bytes: 10,
      confirm: 'I understand',
      confirmedAt: new Date().toISOString(),
    };
    for (const route of ROUTES_11B) {
      const [method, pattern] = route.split(' ') as [string, string];
      await expect(app.call(method, concrete(pattern), { body }), route).rejects.toSatisfy(
        status(403, 'auth.forbidden'),
      );
    }
  });
});

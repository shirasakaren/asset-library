import { describe, it, expect } from 'vitest';
import '@/preview/test-utils';
import { adminRoutes } from '@/preview/handlers/admin/common';
import { adminApp, FX_OTHER, status } from './admin-fixtures';

const concrete = (pattern: string) => pattern.replace(/\{(\w+)\}/g, 'x-id');

describe('every /admin/* route', () => {
  it('registers a meaningful number of admin routes', () => {
    expect(adminRoutes.length).toBeGreaterThanOrEqual(20);
    expect(adminRoutes.every((r) => r.pattern.startsWith('/admin/'))).toBe(true);
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
});

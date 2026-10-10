import type { MeResponse } from '@/lib/api/types';
import type { DeviceRecord } from '../records';
import { route, type PreviewContext } from '../router/router';
import { notFound } from '../router/errors';
import { recordAudit } from './audit-core';
import { buildMeResponse } from './me-basic';
import { serialized } from './write-queue';

/** What `GET /auth/plugin/devices` and `GET /me` list per device (`PluginDevice` in the profile UI). */
export interface PluginDevicePayload {
  id: string;
  deviceLabel: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string;
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Most recently used first; devices never used last; `id` as the tiebreak. */
const byLastUsed = (a: DeviceRecord, b: DeviceRecord) => {
  if (a.lastUsedAt !== b.lastUsedAt) {
    if (a.lastUsedAt === null) return 1;
    if (b.lastUsedAt === null) return -1;
    return cmp(b.lastUsedAt, a.lastUsedAt);
  }
  return cmp(a.id, b.id);
};

/** The persona's active devices: not revoked and not expired (the backend's `listActiveDevices`). */
export async function listActiveDevices(ctx: PreviewContext): Promise<PluginDevicePayload[]> {
  const now = ctx.now().toISOString();
  const rows = await ctx.db.list<DeviceRecord>('devices');
  return rows
    .filter((d) => d.userId === ctx.meId && d.revokedAt === null && d.expiresAt > now)
    .sort(byLastUsed)
    .map((d) => ({
      id: d.id,
      deviceLabel: d.deviceLabel,
      createdAt: d.createdAt,
      lastUsedAt: d.lastUsedAt,
      expiresAt: d.expiresAt,
    }));
}

/**
 * Soft-revokes one of the persona's devices (`revokedAt = now`). Revoking a revoked device is a
 * no-op that keeps the original timestamp. Unknown or foreign ids are a 404 (the backend ignores
 * them silently). Returns the device and whether this call revoked it.
 */
async function revokeDevice(
  ctx: PreviewContext,
  id: string,
): Promise<{ device: DeviceRecord; changed: boolean }> {
  return serialized(async () => {
    const row = await ctx.db.get<DeviceRecord>('devices', id);
    if (!row || row.userId !== ctx.meId) {
      throw notFound(`Device ${id} not found.`, { code: 'device.not_found' });
    }
    if (row.revokedAt !== null) return { device: row, changed: false };
    const device = await ctx.db.patch<DeviceRecord>('devices', id, {
      revokedAt: ctx.now().toISOString(),
    });
    return { device, changed: true };
  });
}

route(
  'GET',
  '/me',
  async (_req, ctx): Promise<MeResponse & { devices: PluginDevicePayload[] }> => ({
    ...(await buildMeResponse(ctx)),
    devices: await listActiveDevices(ctx),
  }),
);

route('GET', '/auth/plugin/devices', (_req, ctx) => listActiveDevices(ctx));

// The backend does not audit this route (only `/me/devices/{id}/revoke`).
route('DELETE', '/auth/plugin/devices/{id}', async (req, ctx): Promise<void> => {
  await revokeDevice(ctx, req.params.id!);
});

route('POST', '/me/devices/{id}/revoke', async (req, ctx): Promise<void> => {
  const { device, changed } = await revokeDevice(ctx, req.params.id!);
  if (changed) {
    await recordAudit(ctx, {
      action: 'me.revoke_device',
      subjectType: 'Device',
      subjectId: device.id,
      metadata: { deviceLabel: device.deviceLabel },
    });
  }
});

// There is no session to end; the backend records an audit row and tells the user's other tabs.
route('POST', '/me/logout', async (_req, ctx): Promise<void> => {
  await recordAudit(ctx, { action: 'me.logout', subjectType: 'User', subjectId: ctx.meId });
});

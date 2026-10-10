import { describe, it, expect } from 'vitest';
import type { AuditRecord, DeviceRecord, NotificationRecord } from '@/preview/records';
import type { MeResponse } from '@/lib/api/types';
import { appWith, status } from './social-fixtures';
import { dev, FX_OTHER, FX_PERSONA, T, withUsers } from './community-fixtures';

describe('GET /me', () => {
  const unread: NotificationRecord = {
    id: 'n-1',
    type: 'COMMENT_CREATED',
    payload: {},
    readAt: null,
    createdAt: T(1),
  };
  it('is /auth/me plus the active devices', async () => {
    const app = await appWith(
      [],
      {},
      {
        ...withUsers(),
        devices: [dev('d-1'), dev('d-2', { revokedAt: T(1) }), dev('d-3', { userId: FX_OTHER })],
        notifications: [unread],
      },
    );
    const me = await app.call<MeResponse & { devices: Array<{ id: string }> }>('GET', '/me');
    const base = await app.call<MeResponse>('GET', '/auth/me');
    const { devices, ...rest } = me;
    expect(rest).toEqual(base);
    expect(rest.unreadNotifications).toBe(1);
    expect(devices.map((d) => d.id)).toEqual(['d-1']);
  });
});

describe('GET /auth/plugin/devices', () => {
  it('lists only active devices of the persona, most recently used first', async () => {
    const app = await appWith(
      [],
      {},
      {
        ...withUsers(),
        devices: [
          dev('d-old', { lastUsedAt: '2026-01-01T00:00:00.000Z' }),
          dev('d-new', { lastUsedAt: '2026-06-01T00:00:00.000Z' }),
          dev('d-never', { lastUsedAt: null }),
          dev('d-revoked', { revokedAt: T(1) }),
          dev('d-expired', { expiresAt: '2020-01-01T00:00:00.000Z' }),
          dev('d-other', { userId: FX_OTHER }),
        ],
      },
    );
    const list = await app.call<Array<Record<string, unknown>>>('GET', '/auth/plugin/devices');
    expect(list.map((d) => d.id)).toEqual(['d-new', 'd-old', 'd-never']);
    expect(Object.keys(list[0]!).sort()).toEqual([
      'createdAt',
      'deviceLabel',
      'expiresAt',
      'id',
      'lastUsedAt',
    ]);
    expect(list[2]!.lastUsedAt).toBeNull();
  });
});

describe('device revoke', () => {
  const devApp = () =>
    appWith(
      [],
      {},
      {
        ...withUsers(),
        devices: [dev('d-1'), dev('d-2'), dev('d-other', { userId: FX_OTHER })],
      },
    );

  it('DELETE /auth/plugin/devices/{id} soft-revokes, idempotently, without an audit row', async () => {
    const app = await devApp();
    expect(await app.call('DELETE', '/auth/plugin/devices/d-1')).toBeUndefined();
    const first = (await app.db.get<DeviceRecord>('devices', 'd-1'))!.revokedAt;
    expect(first).toEqual(expect.any(String));
    expect(await app.call('DELETE', '/auth/plugin/devices/d-1')).toBeUndefined();
    expect((await app.db.get<DeviceRecord>('devices', 'd-1'))!.revokedAt).toBe(first);
    const list = await app.call<Array<{ id: string }>>('GET', '/auth/plugin/devices');
    expect(list.map((d) => d.id)).toEqual(['d-2']);
    expect(await app.db.list('audit')).toHaveLength(0);
  });

  it('POST /me/devices/{id}/revoke revokes once and audits once', async () => {
    const app = await devApp();
    expect(await app.call('POST', '/me/devices/d-2/revoke')).toBeUndefined();
    await app.call('POST', '/me/devices/d-2/revoke');
    expect((await app.db.get<DeviceRecord>('devices', 'd-2'))!.revokedAt).toEqual(
      expect.any(String),
    );
    const audit = await app.db.list<AuditRecord>('audit');
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      action: 'me.revoke_device',
      subjectType: 'Device',
      subjectId: 'd-2',
      actorId: FX_PERSONA,
      metadata: { deviceLabel: 'Device d-2' },
    });
    expect(Date.parse(audit[0]!.createdAt)).not.toBeNaN();
  });

  it('answers 404 for unknown devices and for another user device, leaving it untouched', async () => {
    const app = await devApp();
    for (const [m, p] of [
      ['DELETE', '/auth/plugin/devices/nope'],
      ['POST', '/me/devices/nope/revoke'],
      ['DELETE', '/auth/plugin/devices/d-other'],
      ['POST', '/me/devices/d-other/revoke'],
    ] as const) {
      await expect(app.call(m, p)).rejects.toSatisfy(status(404, 'device.not_found'));
    }
    expect((await app.db.get<DeviceRecord>('devices', 'd-other'))!.revokedAt).toBeNull();
    expect(await app.db.list('audit')).toHaveLength(0);
  });
});

describe('POST /me/logout', () => {
  it('is a harmless no-op that leaves the persona in place (and audits like the backend)', async () => {
    const app = await appWith([], {}, withUsers());
    expect(await app.call('POST', '/me/logout')).toBeUndefined();
    const me = await app.call<MeResponse>('GET', '/auth/me');
    expect(me.id).toBe(FX_PERSONA);
    const audit = await app.db.list<AuditRecord>('audit');
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      action: 'me.logout',
      subjectType: 'User',
      subjectId: FX_PERSONA,
      actorId: FX_PERSONA,
      metadata: null,
    });
  });
});

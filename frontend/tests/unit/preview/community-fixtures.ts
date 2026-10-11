import { FX_OTHER, FX_PERSONA, fixtureUsers } from '@/preview/test-utils';
import type { DeviceRecord, RequestRecord, UserRecord } from '@/preview/records';

export const T = (n: number) => new Date(Date.UTC(2026, 5, 1, 0, 0, n)).toISOString();

export const req = (id: string, over: Partial<RequestRecord> = {}): RequestRecord => ({
  id,
  assetLink: `https://store.example.test/${id}`,
  assetType: '3D model',
  intendedUse: 'Replacing placeholder art in a prototype.',
  price: null,
  notes: null,
  status: 'SENT',
  adminComment: null,
  createdAt: T(1),
  updatedAt: T(1),
  requesterId: FX_PERSONA,
  reviewedById: null,
  ...over,
});

export const VALID_REQUEST = {
  assetLink: 'https://store.example.test/pack',
  assetType: 'Unity 3D model',
  intendedUse: 'Prototype for an internal game jam entry.',
};

export const dev = (id: string, over: Partial<DeviceRecord> = {}): DeviceRecord => ({
  id,
  userId: FX_PERSONA,
  deviceLabel: `Device ${id}`,
  createdAt: '2026-01-01T00:00:00.000Z',
  lastUsedAt: '2026-05-01T00:00:00.000Z',
  expiresAt: '2099-01-01T00:00:00.000Z',
  revokedAt: null,
  ...over,
});

export const extraUsers = (): UserRecord[] => [
  ...fixtureUsers(),
  {
    id: 'u-jose',
    email: 'jose.alvarez@example.test',
    displayName: 'José Álvarez',
    role: 'contributor',
    avatar: { initials: 'JA', bgColor: 'brand-yellow', fgColor: 'ink-black' },
    createdAt: '2025-09-01T00:00:00.000Z',
    locale: 'en',
    isAdmin: false,
  },
  {
    id: 'u-ari',
    email: 'ari.putra@example.test',
    displayName: 'Ari Putra',
    role: 'user',
    avatar: { initials: 'AP', bgColor: 'brand-green', fgColor: 'ink-white' },
    createdAt: '2025-09-02T00:00:00.000Z',
    locale: 'id',
    isAdmin: false,
  },
];

export const withUsers = () => ({ users: extraUsers() });
export { FX_OTHER, FX_PERSONA };

import { beforeEach, describe, expect, it, vi } from 'vitest';

const seed = vi.hoisted(() => ({
  assets: [] as unknown[],
  users: [] as unknown[],
  reports: [] as unknown[],
  requests: [] as unknown[],
}));

vi.mock('@/preview/seed-data/assets.json', () => ({
  get default() {
    return seed.assets;
  },
}));
vi.mock('@/preview/seed-data/users.json', () => ({
  get default() {
    return seed.users;
  },
}));
vi.mock('@/preview/seed-data/reports.json', () => ({
  get default() {
    return seed.reports;
  },
}));
vi.mock('@/preview/seed-data/requests.json', () => ({
  get default() {
    return seed.requests;
  },
}));
vi.mock('@/components/admin/asset-edit-page-client', () => ({
  AdminAssetEditPageClient: () => null,
}));
vi.mock('@/components/admin/report-detail-page-client', () => ({
  AdminReportPageClient: () => null,
}));
vi.mock('@/components/admin/request-detail-page-client', () => ({
  AdminRequestPageClient: () => null,
}));
vi.mock('@/components/admin/user-detail-page-client', () => ({
  AdminUserPageClient: () => null,
}));

import { generateStaticParams as editParams } from '@/app/(app)/admin/assets/[id]/edit/page';
import { generateStaticParams as reportParams } from '@/app/(app)/admin/reports/[id]/page';
import { generateStaticParams as requestParams } from '@/app/(app)/admin/requests/[id]/page';
import { generateStaticParams as userParams } from '@/app/(app)/admin/users/[id]/page';

describe.each([
  ['admin/assets/[id]/edit', editParams, 'assets'],
  ['admin/reports/[id]', reportParams, 'reports'],
  ['admin/requests/[id]', requestParams, 'requests'],
  ['admin/users/[id]', userParams, 'users'],
] as const)('%s generateStaticParams', (_route, generate, collection) => {
  beforeEach(() => {
    seed.assets = [];
    seed.users = [];
    seed.reports = [];
    seed.requests = [];
  });

  it('falls back to a placeholder when the seed is empty (an empty list would fail the export)', () => {
    expect(generate()).toEqual([{ id: '_placeholder' }]);
  });

  it('maps each seeded document to its id', () => {
    seed[collection] = [{ id: 'x1', other: 1 }, { id: 'x2' }];
    expect(generate()).toEqual([{ id: 'x1' }, { id: 'x2' }]);
  });
});

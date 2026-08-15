import { test as base, expect } from '@playwright/test';
import { storageStatePath, type Persona } from './storage';

interface PersonaFixtures {
  asAdmin: void;
  asContributor: void;
  asUser: void;
}

/**
 * Convenience fixtures: declare `asAdmin` (or `asContributor` / `asUser`)
 * in a spec's `test.use({ storageState: ... })` is also valid, but the
 * fixture is more declarative. Use `personaTest` for tests that need a
 * specific role.
 */
export const test = base;
export { expect };

export function withStorageState(persona: Persona) {
  return { storageState: storageStatePath(persona) };
}

export const ROUTES = {
  about: '/about',
  signin: '/auth/signin',
  discover: '/',
  search: '/search',
  library: '/library',
  publish: '/publish',
  publishNew: '/publish/new',
  publishManage: '/publish/manage',
  notifications: '/notifications',
  profile: '/profile',
  request: '/request',
  admin: '/admin',
  adminAssets: '/admin/assets',
  adminFeatured: '/admin/featured',
  adminCategories: '/admin/categories',
  adminTags: '/admin/tags',
  adminLicenses: '/admin/licenses',
  adminReports: '/admin/reports',
  adminRequests: '/admin/requests',
  adminAv: '/admin/av',
  adminStorage: '/admin/storage',
  adminUsers: '/admin/users',
  adminAudit: '/admin/audit',
  adminWebhooks: '/admin/webhooks',
  forbidden: '/403',
} as const;

export type PersonaFixturesType = PersonaFixtures;

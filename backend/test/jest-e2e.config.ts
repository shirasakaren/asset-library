import type { Config } from 'jest';

/**
 * Standalone Jest config for the end-to-end suite. Boots the real Nest app
 * against the docker-compose.test.yml stack (Postgres + Redis + MinIO +
 * Meilisearch) and uses an in-process FakeKeycloak to mint tokens.
 *
 * Run with `pnpm test:e2e`. CI runs the @smoke subset on every PR; the
 * @slow scenarios run nightly.
 */
const config: Config = {
  rootDir: '..',
  testRegex: 'test/e2e/.+\\.e2e-spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
  testEnvironment: 'node',
  testTimeout: 15 * 60 * 1000,
  setupFiles: ['<rootDir>/test/e2e/harness/jest-setup.ts'],
};

export default config;

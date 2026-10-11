/**
 * The sub-path the base-path suite serves and tests the export under. It must equal the
 * `NEXT_PUBLIC_BASE_PATH` the export was built with. Default `/asset-library` (the GitHub project
 * Pages path of this repository); the deploy workflow passes the value `configure-pages` reports
 * as `E2E_BASE_PATH`, so a renamed repository still works.
 */
const raw = (process.env.E2E_BASE_PATH ?? '/asset-library').trim().replace(/\/+$/, '');

export const PREFIX = raw.startsWith('/') ? raw : `/${raw}`;
export const PORT = 4318;
export const ORIGIN = `http://localhost:${PORT}`;

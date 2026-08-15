// The public-env loader (`@/lib/env.public`) throws at module load time when
// NEXT_PUBLIC_* are absent. Set safe defaults for the unit-test environment
// BEFORE @testing-library is imported so any transitively-loaded component
// (e.g. asset-card → ws client) doesn't crash on import.
process.env.NEXT_PUBLIC_APP_URL ??= 'http://localhost:3000';
process.env.NEXT_PUBLIC_API_URL ??= 'http://localhost:4000';
process.env.NEXT_PUBLIC_WS_URL ??= 'ws://localhost:4000/ws';

import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});

// `@/lib/env.public` has defaults for every variable; pin the app URL so tests
// do not depend on the ambient environment.
process.env.NEXT_PUBLIC_APP_URL ??= 'http://localhost:3000';

import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});

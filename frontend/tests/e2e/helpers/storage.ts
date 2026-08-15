import { resolve } from 'node:path';

export type Persona = 'admin' | 'contributor' | 'user';

export const storageStatePath = (persona: Persona): string =>
  resolve('tests/e2e/auth-states', `${persona}.json`);

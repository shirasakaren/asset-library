import { vi } from 'vitest';
import type { ReactNode } from 'react';

export const useSession = () => ({
  data: { accessToken: 'test', user: { name: 'Test', email: 't@t.io' } },
  status: 'authenticated' as const,
  update: vi.fn(),
});

export const getSession = vi.fn(async () => ({
  accessToken: 'test',
  user: { name: 'Test', email: 't@t.io' },
}));

export const signIn = vi.fn();
export const signOut = vi.fn();

export function SessionProvider({ children }: { children: ReactNode }) {
  return children;
}

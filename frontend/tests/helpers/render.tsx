import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as rtlRender, type RenderOptions } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

/** Renders with a QueryClient; pass `client` to inspect the cache afterwards (also returned as `client`). */
export function renderWithProviders(
  ui: ReactElement,
  options: RenderOptions & { client?: QueryClient } = {},
) {
  const { client = makeQueryClient(), ...renderOptions } = options;
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return { ...rtlRender(ui, { wrapper: Wrapper, ...renderOptions }), client };
}

export { rtlRender as renderRaw };

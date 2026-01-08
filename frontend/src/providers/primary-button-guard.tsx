'use client';

import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';

const PrimaryCount = createContext<{ register: () => () => void } | null>(null);

export function PrimaryButtonGuard({ children }: { children: ReactNode }) {
  const counter = useRef(0);
  const value = {
    register: () => {
      counter.current += 1;
      if (counter.current > 1 && process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.warn(
          '[PrimaryButtonGuard] More than one primary button mounted in the same viewport. DS §7.1.',
        );
      }
      return () => {
        counter.current -= 1;
      };
    },
  };
  return <PrimaryCount.Provider value={value}>{children}</PrimaryCount.Provider>;
}

export function useTrackPrimaryButton() {
  const ctx = useContext(PrimaryCount);
  useEffect(() => {
    if (!ctx) return undefined;
    return ctx.register();
  }, [ctx]);
}

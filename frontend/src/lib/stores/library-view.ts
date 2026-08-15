'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface LibraryViewState {
  view: 'grid' | 'list';
  setView: (next: 'grid' | 'list') => void;
}

export const useLibraryView = create<LibraryViewState>()(
  persist(
    (set) => ({
      view: 'grid',
      setView: (next) => set({ view: next }),
    }),
    {
      name: 'mgm.library-view',
      storage: typeof window === 'undefined' ? undefined : createJSONStorage(() => localStorage),
    },
  ),
);

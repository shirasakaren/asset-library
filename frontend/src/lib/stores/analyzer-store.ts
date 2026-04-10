'use client';

import { create } from 'zustand';
import type { AnalysisStatus } from '@/lib/api/types';

interface VersionAnalysisState {
  versionId: string;
  analysisStatus: AnalysisStatus;
  /** Per-file statuses keyed by file id. */
  files: Record<string, { status: AnalysisStatus }>;
  updatedAt: number;
}

interface AnalyzerState {
  versions: Record<string, VersionAnalysisState>;
  applyAnalyzeProgress: (versionId: string, fileId: string, status: AnalysisStatus) => void;
  applyAnalyzeReady: (versionId: string) => void;
  reset: (versionId: string) => void;
}

function ensureVersion(state: AnalyzerState, versionId: string): VersionAnalysisState {
  return (
    state.versions[versionId] ?? {
      versionId,
      analysisStatus: 'PENDING',
      files: {},
      updatedAt: Date.now(),
    }
  );
}

export const useAnalyzerStore = create<AnalyzerState>((set) => ({
  versions: {},
  applyAnalyzeProgress: (versionId, fileId, status) =>
    set((state) => {
      const v = ensureVersion(state, versionId);
      return {
        versions: {
          ...state.versions,
          [versionId]: {
            ...v,
            analysisStatus: status === 'READY' ? 'READY' : 'ANALYZING',
            files: { ...v.files, [fileId]: { status } },
            updatedAt: Date.now(),
          },
        },
      };
    }),
  applyAnalyzeReady: (versionId) =>
    set((state) => {
      const v = ensureVersion(state, versionId);
      return {
        versions: {
          ...state.versions,
          [versionId]: { ...v, analysisStatus: 'READY', updatedAt: Date.now() },
        },
      };
    }),
  reset: (versionId) =>
    set((state) => {
      const next = { ...state.versions };
      delete next[versionId];
      return { versions: next };
    }),
}));

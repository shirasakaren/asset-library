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

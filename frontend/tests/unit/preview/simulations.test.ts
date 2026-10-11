import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssetRecord } from '@/preview/records';
import { cancelPendingSimulations, scheduleSimulation } from '@/preview/simulations';
import { SCHEDULED_RESCAN_MS } from '@/preview/handlers/admin/av';
import { SCHEDULED_ANALYSIS_MS, scheduleAnalysis } from '@/preview/handlers/version-analysis';
import {
  scheduleSimulatedReply,
  SIMULATED_REPLY_DELAY_MS,
} from '@/preview/handlers/simulated-replies';
import { assetsApp } from './admin-fixtures';
import { appWith, cm } from './social-fixtures';
import { FX_PERSONA } from '@/preview/test-utils';

beforeEach(() => vi.useFakeTimers({ now: new Date('2026-06-10T12:00:00.000Z') }));
afterEach(() => {
  cancelPendingSimulations();
  vi.useRealTimers();
});

const settle = async () => {
  for (let i = 0; i < 60; i += 1) await Promise.resolve();
};

describe('cancelPendingSimulations', () => {
  it('stops pending timers, runs their cancel hook and reports how many it cancelled', async () => {
    const ran = vi.fn();
    const cancelled = vi.fn();
    scheduleSimulation(ran, 1000, cancelled);
    scheduleSimulation(ran, 2000);
    expect(cancelPendingSimulations()).toBe(2);
    await vi.advanceTimersByTimeAsync(5000);
    expect(ran).not.toHaveBeenCalled();
    expect(cancelled).toHaveBeenCalledTimes(1);
    expect(cancelPendingSimulations()).toBe(0);
  });

  it('forgets a timer once it fired', async () => {
    const ran = vi.fn();
    const cancelled = vi.fn();
    scheduleSimulation(ran, 10, cancelled);
    await vi.advanceTimersByTimeAsync(20);
    expect(ran).toHaveBeenCalledTimes(1);
    expect(cancelPendingSimulations()).toBe(0);
    expect(cancelled).not.toHaveBeenCalled();
  });
});

describe('the simulations are tied to cancelPendingSimulations', () => {
  it('a pending AV rescan does not fire after the cancel, and can be queued again', async () => {
    const app = await assetsApp();
    app.ctx.timers = true;
    const a = (await app.db.get<AssetRecord>('assets', 'a-fx-001'))!;
    await app.db.patch<AssetRecord>('assets', 'a-fx-001', {
      versions: a.versions.map((v) => ({ ...v, avStatus: 'INFECTED' as const })),
    });
    const status = async () =>
      (await app.db.get<AssetRecord>('assets', 'a-fx-001'))!.versions[0]!.avStatus;
    const rescan = () => app.call('POST', '/admin/av/v-fx-001-1-0-0/rescan');

    await rescan();
    expect(cancelPendingSimulations()).toBe(1);
    await vi.advanceTimersByTimeAsync(SCHEDULED_RESCAN_MS + 100);
    await settle();
    expect(await status()).toBe('INFECTED');

    await rescan(); // the "already pending" guard was released by the cancel
    await vi.advanceTimersByTimeAsync(SCHEDULED_RESCAN_MS + 100);
    await settle();
    expect(await status()).toBe('CLEAN');
  });

  it('a pending version analysis does not fire after the cancel, and can be queued again', async () => {
    const app = await assetsApp();
    app.ctx.timers = true;
    const a = (await app.db.get<AssetRecord>('assets', 'a-fx-001'))!;
    const vid = a.versions[0]!.id;
    await app.db.patch<AssetRecord>('assets', 'a-fx-001', {
      versions: a.versions.map((v) => ({ ...v, analysisStatus: 'PENDING' as const })),
    });
    const state = async () =>
      (await app.db.get<AssetRecord>('assets', 'a-fx-001'))!.versions[0]!.analysisStatus;

    expect(scheduleAnalysis(app.ctx, 'a-fx-001', vid)).toBe(true);
    cancelPendingSimulations();
    await vi.advanceTimersByTimeAsync(SCHEDULED_ANALYSIS_MS + 100);
    await settle();
    expect(await state()).toBe('PENDING');
    expect(scheduleAnalysis(app.ctx, 'a-fx-001', vid)).toBe(true);
    await vi.advanceTimersByTimeAsync(SCHEDULED_ANALYSIS_MS + 100);
    await settle();
    expect(await state()).toBe('READY');
  });

  it('a pending simulated reply does not fire after the cancel, and can be scheduled again', async () => {
    const app = await appWith([cm({ id: 'c-x', authorId: FX_PERSONA })], { timers: true });
    expect(scheduleSimulatedReply(app.ctx, 'c-x')).toBe(true);
    expect(scheduleSimulatedReply(app.ctx, 'c-x')).toBe(false);
    cancelPendingSimulations();
    await vi.advanceTimersByTimeAsync(SIMULATED_REPLY_DELAY_MS + 100);
    await settle();
    const sims = async () =>
      (await app.db.list<{ id: string }>('comments')).filter((c) => c.id.startsWith('c-sim-'));
    expect(await sims()).toHaveLength(0);
    expect(scheduleSimulatedReply(app.ctx, 'c-x')).toBe(true);
  });
});

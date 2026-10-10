import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createDb } from '@/preview/store/db';
import { createIdbOverlay } from '@/preview/store/overlay';
import type { Db, Doc, SeedSource } from '@/preview/types';

const seed: SeedSource = {
  async load(coll) {
    return coll === 'assets' ? [{ id: 'a1' } as Doc] : [];
  },
};

describe('Db.onPersistenceChange', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
  });

  it('notifies once when a quota error flips persistent to false, and stops after unsubscribe', async () => {
    const overlay = createIdbOverlay();
    const db = await createDb({ seed, overlay, seedVersion: '1' });
    const listener = vi.fn();
    const off = db.onPersistenceChange!(listener);
    overlay.set = async () => {
      throw new DOMException('full', 'QuotaExceededError');
    };

    await db.put('assets', { id: 'q1' } as never);
    expect(db.persistent).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(false);

    // later writes stay in memory and do not notify again
    await db.put('assets', { id: 'q2' } as never);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(await db.get('assets', 'q2')).toBeTruthy();

    const late = vi.fn();
    const offLate = db.onPersistenceChange!(late);
    offLate();
    off();
    expect(late).not.toHaveBeenCalled();
  });

  it('does not notify while writes succeed', async () => {
    const db = await createDb({ seed, overlay: createIdbOverlay(), seedVersion: '1' });
    const listener = vi.fn();
    db.onPersistenceChange!(listener);
    await db.put('assets', { id: 'ok' } as never);
    expect(listener).not.toHaveBeenCalled();
    expect(db.persistent).toBe(true);
  });

  it('reset() rejects when the overlay cannot be cleared, changes nothing and works on retry', async () => {
    const overlay = createIdbOverlay();
    const db = await createDb({ seed, overlay, seedVersion: '1' });
    await db.put('assets', { id: 'keep' } as never);
    const listener = vi.fn();
    db.onPersistenceChange!(listener);
    const clear = overlay.clear;
    overlay.clear = async () => {
      throw new Error('blocked');
    };
    await expect(db.reset()).rejects.toThrow('blocked');
    // The old overlay is still what a reload would bring back, so memory must still match it.
    expect(await db.get('assets', 'keep')).toBeTruthy();
    expect(db.persistent).toBe(true);
    expect(listener).not.toHaveBeenCalled();

    overlay.clear = clear;
    await db.reset();
    expect(await db.get('assets', 'keep')).toBeUndefined();
    const reopened = createIdbOverlay();
    await reopened.open();
    expect((await reopened.all()).size).toBe(0);
  });
});

// --- usePersistenceState -------------------------------------------------

const fakeDb = (persistent: boolean) => {
  const listeners = new Set<(p: boolean) => void>();
  const db = {
    persistent,
    onPersistenceChange: (l: (p: boolean) => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  } as unknown as Db;
  return {
    db,
    flip: () => {
      (db as { persistent: boolean }).persistent = false;
      listeners.forEach((l) => l(false));
    },
    listenerCount: () => listeners.size,
  };
};

const toastError = vi.fn();
let current: Promise<Db>;
vi.mock('@/preview', () => ({ getDb: () => current }));
vi.mock('@/components/ui/toaster', () => ({
  toast: { error: (...a: unknown[]) => toastError(...a), info: vi.fn(), success: vi.fn() },
}));

describe('usePersistenceState', () => {
  beforeEach(async () => {
    toastError.mockReset();
    const mod = await import('@/preview/persistence');
    mod.__resetPersistenceToastForTests();
  });

  it('reports persistent until the Db says otherwise, then fires one toast', async () => {
    const f = fakeDb(true);
    current = Promise.resolve(f.db);
    const { usePersistenceState } = await import('@/preview/persistence');
    const { result, unmount } = renderHook(() => usePersistenceState());
    expect(result.current).toBe(true);
    await waitFor(() => expect(f.listenerCount()).toBe(1));

    act(() => f.flip());
    expect(result.current).toBe(false);
    expect(toastError).toHaveBeenCalledTimes(1);
    // the stubbed next-intl returns the message key
    expect(toastError.mock.calls[0]![0]).toBe('preview.storageFullToast');

    unmount();
    expect(f.listenerCount()).toBe(0);
  });

  it('fires the toast only once even with several consumers', async () => {
    const f = fakeDb(true);
    current = Promise.resolve(f.db);
    const { usePersistenceState } = await import('@/preview/persistence');
    renderHook(() => usePersistenceState());
    renderHook(() => usePersistenceState());
    await waitFor(() => expect(f.listenerCount()).toBe(2));
    act(() => f.flip());
    expect(toastError).toHaveBeenCalledTimes(1);
  });

  it('starts as false when storage was already unavailable at boot', async () => {
    const f = fakeDb(false);
    current = Promise.resolve(f.db);
    const { usePersistenceState } = await import('@/preview/persistence');
    const { result } = renderHook(() => usePersistenceState());
    await waitFor(() => expect(result.current).toBe(false));
    expect(toastError).toHaveBeenCalledTimes(1);
  });

  it('stays persistent (no warning) if the Db cannot be built', async () => {
    current = Promise.reject(new Error('boom'));
    current.catch(() => {});
    const { usePersistenceState } = await import('@/preview/persistence');
    const { result } = renderHook(() => usePersistenceState());
    await new Promise((r) => setTimeout(r, 10));
    expect(result.current).toBe(true);
  });
});

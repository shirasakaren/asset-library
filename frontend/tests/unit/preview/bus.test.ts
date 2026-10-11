import { describe, it, expect, vi } from 'vitest';
import { bus } from '@/preview/events/bus';

describe('bus', () => {
  it('delivers events to all listeners and unsubscribes', () => {
    const a = vi.fn();
    const b = vi.fn();
    const offA = bus.on(a);
    const offB = bus.on(b);
    bus.emit({ type: 'assets.changed' });
    expect(a).toHaveBeenCalledWith({ type: 'assets.changed' });
    expect(b).toHaveBeenCalledTimes(1);
    offA();
    bus.emit({ type: 'notification', notificationId: 'n1' });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(2);
    offB();
  });

  it('a throwing listener does not break others or the emitter', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const good = vi.fn();
    const offBad = bus.on(() => {
      throw new Error('bad');
    });
    const offGood = bus.on(good);
    expect(() => bus.emit({ type: 'version.ready', assetId: 'a', versionId: 'v' })).not.toThrow();
    expect(good).toHaveBeenCalledTimes(1);
    offBad();
    offGood();
    spy.mockRestore();
  });

  it('listeners added during emit do not receive the current event', () => {
    const late = vi.fn();
    let offLate = () => {};
    const off = bus.on(() => {
      offLate = bus.on(late);
    });
    bus.emit({ type: 'assets.changed' });
    expect(late).not.toHaveBeenCalled();
    off();
    offLate();
  });
});

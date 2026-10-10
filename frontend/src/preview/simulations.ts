/**
 * Registry of the demo's simulated background work (analysis READY after 2 s, AV rescan, the
 * owner's reply to a comment). Each simulation goes through `scheduleSimulation`, so
 * `resetDemo()` can cancel everything still pending with one call: a timer that fires right after
 * a reset would otherwise write into the freshly wiped overlay.
 */

interface Pending {
  handle: ReturnType<typeof setTimeout>;
  onCancel?: () => void;
}

const pending = new Set<Pending>();

/**
 * Runs `run` after `delayMs`. `onCancel` runs instead when `cancelPendingSimulations()` gets there
 * first (release "already scheduled" guards there, so the same work can be queued again).
 */
export function scheduleSimulation(run: () => void, delayMs: number, onCancel?: () => void): void {
  const entry: Pending = {
    handle: setTimeout(() => {
      pending.delete(entry);
      run();
    }, delayMs),
    onCancel,
  };
  pending.add(entry);
}

/** Cancels every simulation that has not fired yet; returns how many it cancelled. */
export function cancelPendingSimulations(): number {
  const all = [...pending];
  pending.clear();
  for (const entry of all) {
    clearTimeout(entry.handle);
    try {
      entry.onCancel?.();
    } catch {
      // a broken hook must not stop the others
    }
  }
  return all.length;
}

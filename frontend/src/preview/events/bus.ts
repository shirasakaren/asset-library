export type PreviewEvent =
  | { type: 'notification'; notificationId: string }
  | { type: 'version.ready'; assetId: string; versionId: string }
  | { type: 'assets.changed' };

type Listener = (e: PreviewEvent) => void;

const listeners = new Set<Listener>();

/** Tiny in-process pub/sub. A throwing listener never affects the others. */
export const bus: {
  emit(e: PreviewEvent): void;
  on(fn: (e: PreviewEvent) => void): () => void;
} = {
  emit(e) {
    // Snapshot so listeners added/removed during emit don't change this round.
    for (const fn of [...listeners]) {
      try {
        fn(e);
      } catch (err) {
        console.error('[preview] bus listener failed', err);
      }
    }
  },
  on(fn) {
    // Wrap so the same function subscribed twice gets two independent subscriptions.
    const entry: Listener = (e) => fn(e);
    listeners.add(entry);
    return () => {
      listeners.delete(entry);
    };
  },
};

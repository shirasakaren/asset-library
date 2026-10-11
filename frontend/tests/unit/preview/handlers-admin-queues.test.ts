import { describe, it, expect } from 'vitest';
import { adminApp, FX_OTHER, status } from './admin-fixtures';

describe('GET /admin/queues', () => {
  it('lists the backend queue names with zero counts (nothing runs in the demo)', async () => {
    const app = await adminApp();
    const r = await app.call<{
      enabled: boolean;
      queues: Array<{ name: string; counts: Record<string, number> }>;
    }>('GET', '/admin/queues');
    expect(r.enabled).toBe(true);
    const names = r.queues.map((q) => q.name);
    expect(names).toEqual(
      expect.arrayContaining(['analyze', 'notify', 'webhook', 'search-index', 'storage-rollup']),
    );
    expect(names).toHaveLength(14);
    for (const q of r.queues) {
      expect(q.counts).toEqual({ waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 });
    }
  });

  it('is admin-only', async () => {
    const app = await adminApp({ meId: FX_OTHER });
    await expect(app.call('GET', '/admin/queues')).rejects.toSatisfy(status(403));
  });
});

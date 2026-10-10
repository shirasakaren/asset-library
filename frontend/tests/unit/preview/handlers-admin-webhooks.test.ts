import { describe, expect, it } from 'vitest';
import type { AdminWebhookDelivery, AdminWebhookPage } from '@/lib/api/admin-types';
import type { WebhookDeliveryRecord } from '@/preview/records';
import { adminApp, status } from './admin-fixtures';

type App = Awaited<ReturnType<typeof adminApp>>;

const delivery = (
  id: string,
  over: Partial<WebhookDeliveryRecord> = {},
): WebhookDeliveryRecord => ({
  id,
  type: 'asset.published',
  status: 'success',
  recipient: 'https://chat.preview.example/hooks/asset-alerts',
  attempt: 1,
  durationMs: 58,
  requestBody: { event: 'asset.published', asset: { id: 'a-1' } },
  responseStatus: 200,
  responseHeaders: { 'content-type': 'application/json' },
  responseBodyExcerpt: '{"ok":true}',
  createdAt: '2026-06-01T10:00:00.000Z',
  ...over,
});

const rows = (): WebhookDeliveryRecord[] => [
  delivery('wh-1', { createdAt: '2026-06-01T10:00:00.000Z' }),
  delivery('wh-2', {
    type: 'comment.created',
    createdAt: '2026-06-02T10:00:00.000Z',
  }),
  delivery('wh-3', {
    type: 'asset.published',
    status: 'failure',
    responseStatus: 503,
    attempt: 2,
    createdAt: '2026-06-03T10:00:00.000Z',
  }),
  delivery('wh-4', {
    type: 'featured.updated',
    status: 'failure',
    responseStatus: null,
    responseHeaders: null,
    durationMs: null,
    responseBodyExcerpt: 'timeout after 10000ms',
    createdAt: '2026-06-04T10:00:00.000Z',
  }),
  delivery('wh-5', {
    type: 'asset.updated',
    status: 'pending',
    responseStatus: null,
    responseHeaders: null,
    durationMs: null,
    responseBodyExcerpt: null,
    createdAt: '2026-06-05T10:00:00.000Z',
  }),
];

const hooksApp = () => adminApp({}, { webhooks: rows() });
const list = (app: App, query: Record<string, unknown> = {}) =>
  app.call<AdminWebhookPage>('GET', '/admin/webhook-deliveries', { query });
const ids = (page: AdminWebhookPage) => page.items.map((r) => r.id);

describe('GET /admin/webhook-deliveries', () => {
  it('lists the deliveries newest first, as stored', async () => {
    const app = await hooksApp();
    const page = await list(app);
    expect(ids(page)).toEqual(['wh-5', 'wh-4', 'wh-3', 'wh-2', 'wh-1']);
    expect(page.pageInfo).toEqual({ nextCursor: null, hasMore: false });
    const wh1: AdminWebhookDelivery = page.items.find((r) => r.id === 'wh-1')!;
    expect(wh1).toEqual(rows()[0]);
    expect(page.items.find((r) => r.id === 'wh-4')).toMatchObject({
      status: 'failure',
      responseStatus: null,
      responseHeaders: null,
      durationMs: null,
      responseBodyExcerpt: 'timeout after 10000ms',
    });
  });

  it('filters by status', async () => {
    const app = await hooksApp();
    expect(ids(await list(app, { status: 'failure' }))).toEqual(['wh-4', 'wh-3']);
    expect(ids(await list(app, { status: 'pending' }))).toEqual(['wh-5']);
    expect(ids(await list(app, { status: 'success' }))).toEqual(['wh-2', 'wh-1']);
    await expect(list(app, { status: 'queued' })).rejects.toSatisfy(status(400));
  });

  it('filters by type: the page sends what is typed, so a part of the name, in any case', async () => {
    const app = await hooksApp();
    expect(ids(await list(app, { type: 'asset.published' }))).toEqual(['wh-3', 'wh-1']);
    expect(ids(await list(app, { type: 'ASSET' }))).toEqual(['wh-5', 'wh-3', 'wh-1']);
    expect(ids(await list(app, { type: 'created' }))).toEqual(['wh-2']);
    expect(ids(await list(app, { type: 'nothing-like-it' }))).toEqual([]);
    expect(ids(await list(app, { type: 'asset', status: 'failure' }))).toEqual(['wh-3']);
    // the page sends nothing for an empty filter
    expect(ids(await list(app, { type: undefined, status: undefined }))).toHaveLength(5);
  });

  it('pages with a cursor, once each, 50 by default', async () => {
    const app = await hooksApp();
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < 5; i += 1) {
      const page = await list(app, { limit: 2, cursor });
      seen.push(...ids(page));
      if (!page.pageInfo.hasMore) break;
      cursor = page.pageInfo.nextCursor!;
    }
    expect(seen).toEqual(['wh-5', 'wh-4', 'wh-3', 'wh-2', 'wh-1']);
    const many = Array.from({ length: 60 }, (_, i) =>
      delivery(`wh-m${String(i).padStart(2, '0')}`, {
        createdAt: new Date(Date.UTC(2026, 5, 1, 0, i)).toISOString(),
      }),
    );
    const big = await adminApp({}, { webhooks: many });
    const first = await list(big);
    expect(first.items).toHaveLength(50);
    expect(first.pageInfo.hasMore).toBe(true);
  });

  it('is empty without deliveries', async () => {
    const app = await adminApp();
    expect(await list(app)).toEqual({ items: [], pageInfo: { nextCursor: null, hasMore: false } });
  });
});

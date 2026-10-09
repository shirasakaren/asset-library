import {
  createTestApp,
  fixtureAsset,
  fixtureCatalog,
  FX_OTHER,
  FX_PERSONA,
} from '@/preview/test-utils';
import { ApiError } from '@/lib/api/errors';
import type { CollectionName, Doc } from '@/preview/types';
import type { AssetRecord, TagRecord } from '@/preview/records';
import type { AssetDetail, TipTapDoc } from '@/lib/api/types';
import { bus, type PreviewEvent } from '@/preview/events/bus';

export { FX_OTHER, FX_PERSONA };

/** `expect(promise).rejects.toSatisfy(status(404, 'asset.not_found'))`. */
export const status = (s: number, code?: string) => (e: unknown) =>
  ApiError.isApiError(e) && e.status === s && (code === undefined || e.code === code);

export const doc = (text: string): TipTapDoc => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});
export const EMPTY_DOC: TipTapDoc = { type: 'doc', content: [] };

/** The body `publish/new/page.tsx` sends. */
export const wizardCreateBody = (over: Record<string, unknown> = {}) => ({
  title: 'My New Asset',
  engine: 'UNITY',
  categoryId: 'cat-3d-models',
  licenseId: 'lic-mit',
  semver: '1.0.0',
  translations: [{ locale: 'en', shortDescription: '', longDescription: EMPTY_DOC }],
  ...over,
});

/**
 * Fixture catalog (3 published assets owned by `u-other`, `a-fx-001` ...) plus:
 *  - `a-mine-draft`: complete DRAFT of the persona (passes the publish checklist),
 *  - `a-mine-pub`: PUBLISHED asset of the persona (tags `tag-lava`),
 *  - `a-other-draft`: DRAFT of `u-other`,
 *  - `a-gone`: DELETED asset of the persona.
 */
export async function appForWrites(
  opts: { meId?: string; timers?: boolean } = {},
  extra: Partial<Record<CollectionName, Doc[]>> = {},
) {
  const base = fixtureCatalog(3);
  return createTestApp(
    {
      ...base,
      ...extra,
      assets: [
        ...(base.assets ?? []),
        fixtureAsset('a-mine-draft', {
          status: 'DRAFT',
          ownerId: FX_PERSONA,
          title: 'Mine Draft',
          createdAt: '2026-03-01T00:00:00.000Z',
        }),
        fixtureAsset('a-mine-pub', {
          status: 'PUBLISHED',
          ownerId: FX_PERSONA,
          title: 'Mine Published',
          tagIds: ['tag-lava'],
          createdAt: '2026-03-02T00:00:00.000Z',
        }),
        fixtureAsset('a-other-draft', {
          status: 'DRAFT',
          ownerId: FX_OTHER,
          title: 'Other Draft',
        }),
        fixtureAsset('a-gone', { status: 'DELETED', ownerId: FX_PERSONA, title: 'Gone' }),
        ...((extra.assets as AssetRecord[] | undefined) ?? []),
      ],
    },
    opts,
  );
}

export type App = Awaited<ReturnType<typeof appForWrites>>;

export const stored = (app: App, id: string) => app.db.get<AssetRecord>('assets', id);
export const storedOrThrow = async (app: App, id: string) => {
  const a = await stored(app, id);
  if (!a) throw new Error(`asset ${id} missing`);
  return a;
};
export const detail = (app: App, id: string) => app.call<AssetDetail>('GET', `/assets/${id}`);
export const tagBySlug = async (app: App, slug: string) =>
  (await app.db.list<TagRecord>('tags')).find((t) => t.slug === slug);

/** Records bus events for the duration of one test. */
export function recordEvents() {
  const events: PreviewEvent[] = [];
  const off = bus.on((e) => events.push(e));
  return { events, stop: off };
}

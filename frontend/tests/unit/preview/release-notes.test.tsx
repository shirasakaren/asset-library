import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  createSeededTestApp,
  createTestApp,
  fixtureAsset,
  fixtureCatalog,
} from '@/preview/test-utils';
import { normalizeReleaseNotes } from '@/preview/handlers/helpers';
import { pickReleaseNotes, VersionsList } from '@/components/asset/versions-list';
import type { AssetDetail, TipTapDoc } from '@/lib/api/types';

const doc = (text: string): TipTapDoc => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

describe('normalizeReleaseNotes', () => {
  it('wraps a bare document as { en }', () => {
    expect(normalizeReleaseNotes(doc('a'))).toEqual({ en: doc('a') });
  });
  it('keeps a locale map, dropping non-document values', () => {
    expect(normalizeReleaseNotes({ en: doc('a'), id: doc('b') })).toEqual({
      en: doc('a'),
      id: doc('b'),
    });
    expect(normalizeReleaseNotes({ en: doc('a'), id: 'x', fr: doc('c') })).toEqual({
      en: doc('a'),
    });
  });
  it('maps empty and unusable values to null', () => {
    for (const v of [null, undefined, {}, 'x', 5, [], { en: null }]) {
      expect(normalizeReleaseNotes(v)).toBeNull();
    }
  });
});

describe('release notes in the asset detail', () => {
  it('seeded versions come back as { en: doc }', async () => {
    const app = await createSeededTestApp();
    const d = await app.call<AssetDetail>('GET', '/assets/ucupaint');
    expect(d.versions.length).toBeGreaterThan(0);
    for (const v of d.versions) {
      expect(v.releaseNotes, v.id).not.toBeNull();
      expect((v.releaseNotes as { type?: string }).type).toBeUndefined();
      expect(v.releaseNotes!.en!.type).toBe('doc');
    }
  });

  it('a bare doc left in the overlay by older code is adapted on read', async () => {
    const base = fixtureCatalog(1);
    const a = fixtureAsset('a-old', { slug: 'old' });
    a.versions[0]!.releaseNotes = doc('legacy') as never;
    const app = await createTestApp({ ...base, assets: [...(base.assets ?? []), a] });
    const d = await app.call<AssetDetail>('GET', '/assets/old');
    expect(d.versions[0]!.releaseNotes).toEqual({ en: doc('legacy') });
  });

  it('VersionsList shows the seeded release notes', async () => {
    const app = await createSeededTestApp();
    const d = await app.call<AssetDetail>('GET', '/assets/ucupaint');
    for (const v of d.versions) {
      expect(pickReleaseNotes(v.releaseNotes, 'en'), v.id).not.toBeNull();
      expect(pickReleaseNotes(v.releaseNotes, 'id'), v.id).not.toBeNull();
    }
    render(<VersionsList versions={d.versions} onDownload={() => undefined} />);
    expect(
      screen.getAllByText(/Initial release in the library|Bug fixes|Improvements|Updated|Fixes/i)
        .length,
    ).toBeGreaterThan(0);
  });
});

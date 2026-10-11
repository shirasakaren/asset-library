import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AssetDetail, AssetVersionPayload } from '@/lib/api/types';

const replace = vi.hoisted(() => vi.fn());

// usePathname() excludes the base path (the App Router adds it back in router.replace).
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => '/assets/some-asset/',
}));
vi.mock('@/components/rich-text/tiptap-renderer', () => ({ TipTapRenderer: () => <div /> }));
vi.mock('@/components/asset/package-tree', () => ({ PackageTree: () => <div /> }));
vi.mock('@/components/asset/compatibility-table', () => ({ CompatibilityTable: () => <div /> }));
vi.mock('@/components/asset/versions-list', () => ({ VersionsList: () => <div /> }));

import { AssetTabs } from '@/components/asset/asset-tabs';

describe('AssetTabs URL update', () => {
  it('replaces the URL with the router pathname, never window.location.pathname (the base path would double)', async () => {
    // jsdom at a sub-path: window.location.pathname INCLUDES the base path.
    window.history.replaceState(null, '', '/asset-library/assets/some-asset/?x=1');
    const asset = { longDescription: null, versions: [] } as unknown as AssetDetail;
    const version = {
      files: [],
      compatibility: [],
      requiresEmptyProject: false,
    } as unknown as AssetVersionPayload;
    render(<AssetTabs asset={asset} activeVersion={version} onDownloadVersion={() => {}} />);

    await userEvent.setup().click(screen.getByRole('tab', { name: 'asset.tabs.versions' }));

    expect(replace).toHaveBeenCalledTimes(1);
    const [url] = replace.mock.calls[0] as [string];
    expect(url).toBe('/assets/some-asset/?x=1#versions');
    expect(url).not.toContain('asset-library');
  });
});

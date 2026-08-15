import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import { PackageTree } from '@/components/asset/package-tree';
import type { AssetFile } from '@/lib/api/types';

const files: AssetFile[] = [
  { id: 'a', relativePath: 'Assets/Demo/Hero.prefab', kind: 'PREFAB', bytes: '8192' },
  { id: 'b', relativePath: 'Assets/Demo/Hero.fbx', kind: 'FBX', bytes: '102400' },
  { id: 'c', relativePath: 'Assets/Demo/Textures/Hero_diff.png', kind: 'TEXTURE_2D', bytes: '4096' },
  { id: 'd', relativePath: 'README.md', kind: 'OTHER', bytes: '512' },
];

describe('PackageTree', () => {
  it('renders the file count summary', () => {
    render(<PackageTree files={files} />);
    // The next-intl stub returns the i18n key; the summary uses the
    // "asset.package.summary" translation key.
    expect(screen.getByText(/summary/i)).toBeInTheDocument();
  });

  it('filters by path on search input', async () => {
    const { container } = render(<PackageTree files={files} />);
    const user = userEvent.setup();
    const input = container.querySelector('input[type="search"]') as HTMLInputElement;
    await user.type(input, 'Textures');
    // README.md should be filtered out of the tree
    expect(screen.queryByText('README.md')).toBeNull();
  });
});

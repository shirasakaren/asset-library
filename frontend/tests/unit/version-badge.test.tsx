import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { VersionBadge } from '@/components/asset/version-badge';

describe('VersionBadge', () => {
  it('renders the semver in tabular monospace', () => {
    render(<VersionBadge semver="1.2.3" />);
    expect(screen.getByText('1.2.3')).toBeInTheDocument();
  });

  it('marks the latest version with the LATEST tag', () => {
    render(<VersionBadge semver="2.0.0" isLatest />);
    expect(screen.getByText('LATEST')).toBeInTheDocument();
  });

  it('omits the LATEST tag for older versions', () => {
    render(<VersionBadge semver="1.0.0" />);
    expect(screen.queryByText('LATEST')).toBeNull();
  });
});

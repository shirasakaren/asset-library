import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { CompatibilityTable } from '@/components/asset/compatibility-table';

describe('CompatibilityTable', () => {
  it('shows the requires-empty-project alert when flag set', () => {
    render(
      <CompatibilityTable
        rows={[{ engineVersion: '6000.1.14f1', renderPipelines: ['URP'], targets: ['WINDOWS'] }]}
        requiresEmptyProject
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/EmptyProject/i);
  });

  it('renders all engine rows and chips', () => {
    render(
      <CompatibilityTable
        rows={[
          { engineVersion: '6000.0.2f1', renderPipelines: ['URP', 'HDRP'], targets: ['WINDOWS', 'MAC'] },
          { engineVersion: '6000.1.14f1', renderPipelines: [], targets: ['IOS'] },
        ]}
      />,
    );
    expect(screen.getByText('6000.0.2f1')).toBeInTheDocument();
    expect(screen.getByText('6000.1.14f1')).toBeInTheDocument();
    expect(screen.getByText(/renderPipeline\.URP|URP/)).toBeInTheDocument();
    expect(screen.getByText(/renderPipeline\.HDRP|HDRP/)).toBeInTheDocument();
    // 'iOS' label comes from the search.target.IOS translation; under the
    // next-intl stub that key is returned verbatim.
    expect(screen.getByText(/target\.IOS|iOS/)).toBeInTheDocument();
  });
});

import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { EngineLogo, engineLabels } from '@/components/asset/engine-logo';

describe('EngineLogo', () => {
  it('renders an SVG for each engine type', () => {
    for (const engine of ['UNITY', 'UNREAL', 'ENGINE_AGNOSTIC'] as const) {
      const { container, unmount } = render(<EngineLogo engine={engine} />);
      expect(container.querySelector('svg')).toBeTruthy();
      unmount();
    }
  });

  it('exposes localized labels', () => {
    expect(engineLabels.UNITY).toBe('Unity');
    expect(engineLabels.UNREAL).toBe('Unreal');
    expect(engineLabels.ENGINE_AGNOSTIC).toBe('Engine-agnostic');
  });
});

import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Badge } from '@/components/ui/badge';

describe('Badge', () => {
  it('renders all variants', () => {
    for (const variant of [
      'neutral',
      'info',
      'success',
      'warning',
      'danger',
      'outline',
      'solid',
    ] as const) {
      const { unmount } = render(<Badge variant={variant}>{variant}</Badge>);
      expect(screen.getByText(variant)).toBeInTheDocument();
      unmount();
    }
  });

  it('renders different sizes', () => {
    for (const size of ['sm', 'md', 'lg'] as const) {
      const { unmount } = render(<Badge size={size}>label-{size}</Badge>);
      expect(screen.getByText(`label-${size}`)).toBeInTheDocument();
      unmount();
    }
  });
});

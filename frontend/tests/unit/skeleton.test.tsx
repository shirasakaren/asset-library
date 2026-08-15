import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Skeleton, SkeletonText } from '@/components/ui/skeleton';

describe('Skeleton', () => {
  it('renders with the shimmer class', () => {
    const { container } = render(<Skeleton className="h-4 w-32" />);
    expect(container.firstChild).toHaveClass('skeleton');
  });
});

describe('SkeletonText', () => {
  it('renders N lines', () => {
    const { container } = render(<SkeletonText lines={4} />);
    expect(container.querySelectorAll('.skeleton')).toHaveLength(4);
  });
});

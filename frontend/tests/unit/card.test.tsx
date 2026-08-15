import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Card, CardTitle, CardDescription } from '@/components/ui/card';

describe('Card', () => {
  it('renders title and description', () => {
    render(
      <Card>
        <CardTitle>Hello</CardTitle>
        <CardDescription>World</CardDescription>
      </Card>,
    );
    expect(screen.getByText('Hello')).toBeInTheDocument();
    expect(screen.getByText('World')).toBeInTheDocument();
  });

  it('renders all variants', () => {
    for (const variant of ['outlined', 'tinted', 'inverse', 'flat'] as const) {
      const { unmount } = render(<Card variant={variant}>v-{variant}</Card>);
      expect(screen.getByText(`v-${variant}`)).toBeInTheDocument();
      unmount();
    }
  });
});

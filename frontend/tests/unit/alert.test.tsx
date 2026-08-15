import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Alert } from '@/components/ui/alert';

describe('Alert', () => {
  it('renders title and body', () => {
    render(
      <Alert variant="info" title="Heads up">
        New asset available
      </Alert>,
    );
    expect(screen.getByText('Heads up')).toBeInTheDocument();
    expect(screen.getByText('New asset available')).toBeInTheDocument();
  });

  it('has role=alert', () => {
    render(<Alert variant="danger">Boom</Alert>);
    expect(screen.getByRole('alert')).toHaveTextContent('Boom');
  });
});

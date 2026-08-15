import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import { Input, Textarea, Field } from '@/components/ui/input';

describe('Input', () => {
  it('accepts text', async () => {
    render(<Input placeholder="email" />);
    const el = screen.getByPlaceholderText('email');
    await userEvent.type(el, 'hello');
    expect(el).toHaveValue('hello');
  });

  it('marks invalid when invalid=true', () => {
    render(<Input invalid placeholder="x" />);
    expect(screen.getByPlaceholderText('x')).toHaveAttribute('aria-invalid', 'true');
  });

  it('respects disabled', () => {
    render(<Input disabled placeholder="x" />);
    expect(screen.getByPlaceholderText('x')).toBeDisabled();
  });
});

describe('Textarea', () => {
  it('renders rows', () => {
    render(<Textarea placeholder="bio" rows={6} />);
    expect(screen.getByPlaceholderText('bio')).toHaveAttribute('rows', '6');
  });
});

describe('Field', () => {
  it('renders label and error', () => {
    render(
      <Field id="email" label="Email" error="bad email" required>
        <Input id="email" />
      </Field>,
    );
    expect(screen.getByText('Email')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('bad email');
  });
});

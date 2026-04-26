import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { TipTapRenderer } from '@/components/rich-text/tiptap-renderer';
import type { TipTapDoc } from '@/lib/api/types';

describe('TipTapRenderer', () => {
  it('renders text marks for bold/italic/code/link', () => {
    const doc: TipTapDoc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Hello ' },
            { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
            { type: 'text', text: ' & ' },
            { type: 'text', text: 'italic', marks: [{ type: 'italic' }] },
            { type: 'text', text: ' & ' },
            { type: 'text', text: 'code()', marks: [{ type: 'code' }] },
            { type: 'text', text: ' ' },
            {
              type: 'text',
              text: 'link',
              marks: [{ type: 'link', attrs: { href: 'https://example.com' } }],
            },
          ],
        },
      ],
    };
    render(<TipTapRenderer doc={doc} />);
    expect(screen.getByText('bold').tagName).toBe('STRONG');
    expect(screen.getByText('italic').tagName).toBe('EM');
    expect(screen.getByText('code()').tagName).toBe('CODE');
    const link = screen.getByText('link') as HTMLAnchorElement;
    expect(link.tagName).toBe('A');
    expect(link.href).toContain('https://example.com');
    expect(link.rel).toContain('noopener');
    expect(link.target).toBe('_blank');
  });

  it('renders headings, lists, and code blocks', () => {
    const doc: TipTapDoc = {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Section' }],
        },
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a' }] }] },
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'b' }] }] },
          ],
        },
        {
          type: 'codeBlock',
          content: [{ type: 'text', text: 'console.log(42)' }],
        },
      ],
    };
    const { container } = render(<TipTapRenderer doc={doc} />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Section');
    expect(container.querySelectorAll('li')).toHaveLength(2);
    expect(container.querySelector('pre')).toHaveTextContent('console.log(42)');
  });

  it('refuses to render javascript: links', () => {
    const doc: TipTapDoc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'click',
              marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
            },
          ],
        },
      ],
    };
    render(<TipTapRenderer doc={doc} />);
    const link = screen.getByText('click') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('#');
  });

  it('shows a friendly empty state when doc is null', () => {
    render(<TipTapRenderer doc={null} />);
    expect(screen.getByText('No content provided.')).toBeInTheDocument();
  });
});

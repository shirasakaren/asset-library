import { describe, it, expect } from 'vitest';
import { stripDisallowedLiteNodes } from '@/components/rich-text/lite-nodes';
import type { TipTapDoc } from '@/lib/api/types';

describe('stripDisallowedLiteNodes', () => {
  it('keeps allowed Lite nodes and marks', () => {
    const doc: TipTapDoc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'hi ' },
            { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
          ],
        },
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'item' }] }] },
          ],
        },
      ],
    };
    const cleaned = stripDisallowedLiteNodes(doc);
    expect(cleaned.content?.[0]?.type).toBe('paragraph');
    expect(cleaned.content?.[1]?.type).toBe('bulletList');
  });

  it('strips disallowed nodes (table, video, headings) but keeps images', () => {
    const doc: TipTapDoc = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'H1' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'ok' }] },
        // Images/GIFs are allowed in lite mode (comments) since the editor
        // supports inline image + GIF embeds.
        { type: 'image', attrs: { src: '/x' } },
        { type: 'table', content: [] },
      ],
    };
    const cleaned = stripDisallowedLiteNodes(doc);
    expect(cleaned.content?.map((n) => n.type)).toEqual(['paragraph', 'image']);
  });

  it('strips disallowed marks (underline, highlight, textStyle)', () => {
    const doc: TipTapDoc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'styled',
              marks: [{ type: 'bold' }, { type: 'underline' }, { type: 'highlight' }],
            },
          ],
        },
      ],
    };
    const cleaned = stripDisallowedLiteNodes(doc);
    const textNode = cleaned.content?.[0]?.content?.[0];
    expect(textNode?.marks?.map((m) => m.type)).toEqual(['bold']);
  });
});

import {
  LITE_TIPTAP_ALLOWLIST,
  FULL_TIPTAP_ALLOWLIST,
  validateFullTipTap,
  validateLiteTipTap,
} from '../../src/common/tiptap/validate';

describe('TipTap validators', () => {
  describe('lite schema (comments)', () => {
    it('accepts a minimal document with allowed nodes and marks', () => {
      const doc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Hello ', marks: [{ type: 'bold' }] },
              { type: 'text', text: 'world.' },
            ],
          },
        ],
      };
      const sanitized = validateLiteTipTap(doc);
      expect(sanitized).toMatchObject({ type: 'doc' });
    });

    it('forces rel="noopener nofollow" + target=_blank on link marks', () => {
      const doc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'link',
                marks: [{ type: 'link', attrs: { href: 'https://example.com' } }],
              },
            ],
          },
        ],
      };
      const sanitized = validateLiteTipTap(doc) as unknown as {
        content: Array<{ content: Array<{ marks: Array<{ attrs?: Record<string, unknown> }> }> }>;
      };
      const linkAttrs = sanitized.content[0].content[0].marks[0].attrs;
      expect(linkAttrs).toMatchObject({
        href: 'https://example.com',
        rel: 'noopener nofollow',
        target: '_blank',
      });
    });

    it('rejects disallowed nodes (e.g. heading)', () => {
      expect(() =>
        validateLiteTipTap({
          type: 'doc',
          content: [
            { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'No' }] },
          ],
        }),
      ).toThrow(/disallowed/i);
    });

    it('rejects oversized documents', () => {
      const giant = {
        type: 'doc',
        content: Array.from({ length: 2000 }, () => ({
          type: 'paragraph',
          content: [{ type: 'text', text: 'x'.repeat(50) }],
        })),
      };
      expect(() => validateLiteTipTap(giant)).toThrow(/exceeds/);
    });
  });

  describe('full schema (asset description)', () => {
    it('caps heading level at 3', () => {
      expect(() =>
        validateFullTipTap({
          type: 'doc',
          content: [
            { type: 'heading', attrs: { level: 5 }, content: [{ type: 'text', text: 'h5' }] },
          ],
        }),
      ).toThrow(/disallowed/i);
    });

    it('allows images, tables, and embeds', () => {
      const doc = {
        type: 'doc',
        content: [
          {
            type: 'table',
            content: [
              {
                type: 'tableRow',
                content: [
                  {
                    type: 'tableHeader',
                    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A' }] }],
                  },
                ],
              },
            ],
          },
          { type: 'image', attrs: { src: 'https://cdn.example.com/x.png', alt: 'x' } },
          { type: 'embed', attrs: { src: 'https://youtube.com/embed/abc', provider: 'youtube' } },
        ],
      };
      expect(() => validateFullTipTap(doc)).not.toThrow();
    });
  });

  it('declares the expected allowlist sizes', () => {
    expect(LITE_TIPTAP_ALLOWLIST.maxBytes).toBe(24 * 1024);
    expect(FULL_TIPTAP_ALLOWLIST.maxBytes).toBe(100 * 1024);
  });
});

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

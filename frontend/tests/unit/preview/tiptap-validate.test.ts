import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import { validateFullTipTap, validateLiteTipTap } from '@/preview/handlers/tiptap-validate';

const p = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const wrap = (...content: unknown[]) => ({ type: 'doc', content });

function fail(fn: () => unknown): ApiError {
  try {
    fn();
  } catch (e) {
    if (ApiError.isApiError(e)) return e;
    throw e;
  }
  throw new Error('expected a failure');
}

describe('validateFullTipTap', () => {
  it('accepts an empty doc and the full node set', () => {
    expect(validateFullTipTap({ type: 'doc', content: [] })).toEqual({ type: 'doc' });
    const doc = wrap(
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'H' }] },
      p('x'),
      { type: 'bulletList', content: [{ type: 'listItem', content: [p('a')] }] },
      { type: 'blockquote', content: [p('q')] },
      { type: 'codeBlock', attrs: { language: 'ts' }, content: [{ type: 'text', text: 'x' }] },
      { type: 'horizontalRule' },
      {
        type: 'table',
        content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [p('c')] }] }],
      },
    );
    expect(() => validateFullTipTap(doc)).not.toThrow();
  });

  it('strips unknown attributes and forces link rel/target', () => {
    const doc = wrap({
      type: 'paragraph',
      attrs: { evil: 1 },
      content: [
        {
          type: 'text',
          text: 'a',
          marks: [{ type: 'link', attrs: { href: 'https://x.test', onclick: 'x' } }],
        },
      ],
    });
    const out = validateFullTipTap(doc) as unknown as {
      content: { attrs?: unknown; content: { marks: { attrs: Record<string, string> }[] }[] }[];
    };
    expect(out.content[0]!.attrs).toBeUndefined();
    expect(out.content[0]!.content[0]!.marks[0]!.attrs).toEqual({
      href: 'https://x.test',
      rel: 'noopener nofollow',
      target: '_blank',
    });
  });

  it('rejects disallowed nodes and marks with backend-shaped fields', () => {
    const e = fail(() =>
      validateFullTipTap(
        wrap(
          { type: 'script' },
          { type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'weird' }] }] },
        ),
      ),
    );
    expect(e.status).toBe(400);
    expect(e.code).toBe('comment.long_tiptap_violation');
    expect(e.fields).toEqual([
      {
        path: '$.content[0]',
        code: 'node.disallowed',
        message: 'Node type "script" is not allowed.',
      },
      {
        path: '$.content[1].content[0].marks[0]',
        code: 'mark.disallowed',
        message: 'Mark "weird" is not allowed.',
      },
    ]);
  });

  it('rejects heading levels above 3', () => {
    const e = fail(() => validateFullTipTap(wrap({ type: 'heading', attrs: { level: 4 } })));
    expect(e.fields?.[0]).toMatchObject({
      path: '$.content[0].attrs.level',
      code: 'heading.level_out_of_range',
    });
  });

  it('rejects non-objects, a wrong root and oversized docs', () => {
    expect(fail(() => validateFullTipTap(null)).status).toBe(400);
    expect(fail(() => validateFullTipTap('x')).status).toBe(400);
    expect(fail(() => validateFullTipTap({ type: 'paragraph' })).status).toBe(400);
    const big = wrap(p('x'.repeat(101 * 1024)));
    expect(fail(() => validateFullTipTap(big)).message).toMatch(/exceeds/);
  });
});

describe('validateLiteTipTap', () => {
  it('accepts lite nodes and rejects headings', () => {
    expect(() =>
      validateLiteTipTap(wrap(p('hi'), { type: 'bulletList', content: [] })),
    ).not.toThrow();
    const e = fail(() => validateLiteTipTap(wrap({ type: 'heading', attrs: { level: 1 } })));
    expect(e.code).toBe('comment.lite_tiptap_violation');
  });

  it('caps at 24 KiB', () => {
    expect(fail(() => validateLiteTipTap(wrap(p('x'.repeat(25 * 1024))))).status).toBe(400);
  });
});

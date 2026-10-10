import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createElement, Fragment, type ReactNode } from 'react';
import en from '../../messages/en.json';
import id from '../../messages/id.json';

// Minimal ICU-ish `t.rich`: replaces `{name}` values and `<tag>chunks</tag>` with the tag function,
// reading the REAL message files so a placeholder/tag mismatch in the JSON fails the test.
const messages = { current: en as Record<string, any> };
vi.mock('next-intl', () => ({
  useTranslations: (scope: string) => {
    const raw = (key: string) => messages.current[scope][key] as string;
    const t = (key: string) => raw(key);
    t.rich = (key: string, tags: Record<string, (chunks: ReactNode) => ReactNode>) => {
      const parts: ReactNode[] = [];
      const re = /<(\w+)>(.*?)<\/\1>/g;
      const text = raw(key);
      let last = 0;
      let m: RegExpExecArray | null;
      let n = 0;
      while ((m = re.exec(text))) {
        parts.push(text.slice(last, m.index));
        const fn = tags[m[1]!];
        if (!fn) throw new Error(`no tag function for <${m[1]}>`);
        parts.push(createElement(Fragment, { key: n++ }, fn(m[2])));
        last = m.index + m[0].length;
      }
      parts.push(text.slice(last));
      if (/\{\w+\}/.test(parts.filter((p) => typeof p === 'string').join(''))) {
        throw new Error(`unreplaced placeholder in ${key}`);
      }
      return parts;
    };
    return t;
  },
}));

import { DownloadThankYouBody } from '@/components/asset/download-thank-you';

describe('download thank-you message', () => {
  it('renders the link text inside the sentence (en)', () => {
    messages.current = en;
    render(
      <p data-testid="p">
        <DownloadThankYouBody url="blob:x/1" fileName="pack.zip" />
      </p>,
    );
    const link = screen.getByRole('link', { name: 'click here' });
    expect(link).toHaveAttribute('href', 'blob:x/1');
    expect(link).toHaveAttribute('download', 'pack.zip');
    expect(screen.getByTestId('p')).toHaveTextContent(
      "If your download didn't start automatically, click here.",
    );
    expect(screen.getByTestId('p').textContent).not.toMatch(/automatically, \./);
  });

  it('renders the link text inside the sentence (id)', () => {
    messages.current = id;
    render(
      <p data-testid="p">
        <DownloadThankYouBody url="blob:x/1" fileName="pack.zip" />
      </p>,
    );
    expect(screen.getByRole('link', { name: 'klik di sini' })).toBeInTheDocument();
    expect(screen.getByTestId('p').textContent).not.toMatch(/berjalan, \./);
  });
});

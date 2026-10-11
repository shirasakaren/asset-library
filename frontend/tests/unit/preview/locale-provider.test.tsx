import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { useLocale, useMessages } from 'next-intl';
import { LocaleProvider, useLocaleSwitch } from '@/providers/locale-provider';
import en from '../../../messages/en.json';
import id from '../../../messages/id.json';

const KEY = 'preview.locale';

function Probe() {
  const locale = useLocale();
  const { setLocale } = useLocaleSwitch();
  const messages = useMessages();
  return (
    <div>
      <span data-testid="locale">{locale}</span>
      <span data-testid="messages">
        {messages === (id as unknown) ? 'id' : messages === (en as unknown) ? 'en' : '?'}
      </span>
      <button onClick={() => setLocale('id')}>to-id</button>
      <button onClick={() => setLocale('en')}>to-en</button>
    </div>
  );
}

function renderProvider() {
  return render(
    <LocaleProvider>
      <Probe />
    </LocaleProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.lang = '';
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('LocaleProvider', () => {
  it('defaults to en with the en messages', async () => {
    renderProvider();
    expect(await screen.findByTestId('locale')).toHaveTextContent('en');
    expect(screen.getByTestId('messages')).toHaveTextContent('en');
    expect(document.documentElement.lang).toBe('en');
  });

  it('restores id from localStorage, with the id messages', async () => {
    window.localStorage.setItem(KEY, 'id');
    renderProvider();
    expect(await screen.findByTestId('locale')).toHaveTextContent('id');
    expect(screen.getByTestId('messages')).toHaveTextContent('id');
    expect(document.documentElement.lang).toBe('id');
  });

  it('ignores an invalid stored value', async () => {
    window.localStorage.setItem(KEY, 'fr');
    renderProvider();
    expect(await screen.findByTestId('locale')).toHaveTextContent('en');
  });

  it('survives localStorage throwing on read and write', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    renderProvider();
    expect(await screen.findByTestId('locale')).toHaveTextContent('en');
    await act(async () => {
      screen.getByText('to-id').click();
    });
    expect(screen.getByTestId('locale')).toHaveTextContent('id');
    expect(document.documentElement.lang).toBe('id');
  });

  it('setLocale persists, updates state and <html lang>', async () => {
    renderProvider();
    await screen.findByTestId('locale');
    await act(async () => {
      screen.getByText('to-id').click();
    });
    expect(screen.getByTestId('locale')).toHaveTextContent('id');
    expect(screen.getByTestId('messages')).toHaveTextContent('id');
    expect(window.localStorage.getItem(KEY)).toBe('id');
    expect(document.documentElement.lang).toBe('id');
  });

  it('renders nothing on the server (children wait for the stored locale)', async () => {
    const { renderToString } = await import('react-dom/server');
    expect(
      renderToString(
        <LocaleProvider>
          <p>child</p>
        </LocaleProvider>,
      ),
    ).not.toContain('child');
  });
});

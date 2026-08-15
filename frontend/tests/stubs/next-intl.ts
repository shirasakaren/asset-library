import { vi } from 'vitest';

type Replacements = Record<string, unknown>;

function format(key: string, values?: Replacements): string {
  if (!values) return key;
  let out = key;
  for (const [k, v] of Object.entries(values)) {
    out = out.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
  }
  return out;
}

export function useTranslations(scope?: string) {
  return (key: string, values?: Replacements) => {
    const full = scope ? `${scope}.${key}` : key;
    return format(full, values);
  };
}

export const useLocale = () => 'en';

export const useNow = () => new Date();

export const useFormatter = vi.fn();

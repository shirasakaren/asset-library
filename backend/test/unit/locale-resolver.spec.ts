import { Locale } from '@prisma/client';
import { pickTranslation, resolveLocalized } from '../../src/common/i18n/locale-resolver';

describe('i18n/locale-resolver', () => {
  describe('resolveLocalized', () => {
    it('returns the requested locale when present', () => {
      expect(resolveLocalized({ en: 'Hello', id: 'Halo' }, Locale.id)).toBe('Halo');
    });

    it('falls back to the first available key when missing', () => {
      expect(resolveLocalized({ en: 'Only English' }, Locale.id)).toBe('Only English');
    });

    it('returns null for empty / nullish input', () => {
      expect(resolveLocalized(null, Locale.en)).toBeNull();
      expect(resolveLocalized(undefined, Locale.en)).toBeNull();
      expect(resolveLocalized({}, Locale.en)).toBeNull();
    });
  });

  describe('pickTranslation', () => {
    it('prefers an exact locale match', () => {
      const rows = [
        { locale: Locale.en, value: 'EN' },
        { locale: Locale.id, value: 'ID' },
      ];
      expect(pickTranslation(rows, Locale.id)?.value).toBe('ID');
    });

    it('falls back to the first row when the locale is absent', () => {
      const rows = [{ locale: Locale.en, value: 'EN' }];
      expect(pickTranslation(rows, Locale.id)?.value).toBe('EN');
    });

    it('returns null when there are no rows', () => {
      expect(pickTranslation<{ locale: Locale }>([], Locale.en)).toBeNull();
    });
  });
});

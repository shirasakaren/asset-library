import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';
import { supportedLocales, publicEnv, type Locale } from '@/lib/env.public';

export default getRequestConfig(async () => {
  const cookieLocale = (await cookies()).get('NEXT_LOCALE')?.value as Locale | undefined;
  const locale: Locale =
    cookieLocale && supportedLocales.includes(cookieLocale)
      ? cookieLocale
      : (publicEnv.NEXT_PUBLIC_DEFAULT_LOCALE as Locale);
  const messages = (await import(`../../../messages/${locale}.json`)).default;
  return { locale, messages };
});

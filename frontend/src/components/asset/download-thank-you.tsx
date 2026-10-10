'use client';

import { useTranslations } from 'next-intl';

/** "If your download didn't start automatically, click here." with the link on the last words. */
export function DownloadThankYouBody({ url, fileName }: { url: string; fileName: string }) {
  const t = useTranslations('download');
  return (
    <>
      {t.rich('thankYouBody', {
        link: (chunks) => (
          <a className="link-inline" href={url} download={fileName}>
            {chunks}
          </a>
        ),
      })}
    </>
  );
}

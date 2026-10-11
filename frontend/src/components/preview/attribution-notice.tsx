'use client';

import { useTranslations } from 'next-intl';

/** Takedown contact for the real store thumbnails/listings the demo shows. */
export const TAKEDOWN_EMAIL = 'it@labmgm.org';
const SOURCE_URL = 'https://github.com/shirasakaren/asset-library';

/** Credit line for the listings shown in the demo, plus where the (static, serverless) source lives. */
export function AttributionNotice() {
  const t = useTranslations('preview');
  return (
    <div className="max-w-[760px] space-y-1 text-caption text-ink-3">
      <p>
        {t('attributionLead')}{' '}
        <a className="link-inline" href={`mailto:${TAKEDOWN_EMAIL}`}>
          {TAKEDOWN_EMAIL}
        </a>
        .
      </p>
      <p>{t('attributionFictional')}</p>
      <p>
        {t('staticDemo')}{' '}
        <a className="link-inline" href={SOURCE_URL} target="_blank" rel="noopener noreferrer">
          {t('sourceOnGithub')}
        </a>
        .
      </p>
    </div>
  );
}

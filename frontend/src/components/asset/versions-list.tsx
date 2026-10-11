'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { VersionBadge } from './version-badge';
import { TipTapRenderer } from '@/components/rich-text/tiptap-renderer';
import { formatBytes, formatDate } from '@/lib/format';
import type { AssetVersionPayload, LocaleCode, ReleaseNotes, TipTapDoc } from '@/lib/api/types';

interface VersionsListProps {
  versions: AssetVersionPayload[];
  onDownload: (versionId: string) => void;
}

/** The notes in the UI locale, falling back to English, then Indonesian. */
export function pickReleaseNotes(
  notes: ReleaseNotes | null | undefined,
  locale: LocaleCode,
): TipTapDoc | null {
  if (!notes || typeof notes !== 'object') return null;
  return notes[locale] ?? notes.en ?? notes.id ?? null;
}

export function VersionsList({ versions, onDownload }: VersionsListProps) {
  const t = useTranslations('asset.versions');
  const locale = useLocale() as LocaleCode;
  if (versions.length === 0) {
    return <p className="text-body-sm text-ink-3">{t('noVersions')}</p>;
  }

  return (
    <ul className="space-y-3">
      {versions.map((v) => {
        const notes = pickReleaseNotes(v.releaseNotes, locale);
        return (
          <li key={v.id} className="rounded-[16px] border border-line bg-surface p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <VersionBadge semver={v.semver} isLatest={v.isLatest} />
                <span className="geist-tnum text-caption text-ink-3">
                  {v.publishedAt
                    ? t('publishedAt', {
                        when: formatDate(v.publishedAt, locale, { dateStyle: 'medium' }),
                      })
                    : null}
                </span>
              </div>
              <div className="geist-tnum flex items-center gap-3 text-caption text-ink-3">
                <span>{v.fileCount} files</span>
                <span aria-hidden>·</span>
                <span>{formatBytes(v.bytesTotal, locale)}</span>
                <Button size="sm" variant="secondary" onClick={() => onDownload(v.id)}>
                  {t('downloadThis')}
                </Button>
              </div>
            </div>
            {notes ? (
              <div className="mt-4 border-t border-line pt-4">
                <TipTapRenderer doc={notes} variant="lite" />
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { VersionBadge } from './version-badge';
import { TipTapRenderer } from '@/components/rich-text/tiptap-renderer';
import { formatBytes, formatDate } from '@/lib/format';
import type { AssetVersionPayload, LocaleCode, TipTapDoc } from '@/lib/api/types';

interface VersionsListProps {
  versions: AssetVersionPayload[];
  onDownload: (versionId: string) => void;
}

function pickReleaseNotes(notes: unknown, locale: LocaleCode): TipTapDoc | null {
  if (!notes || typeof notes !== 'object') return null;
  const map = notes as Record<string, TipTapDoc | undefined>;
  return map[locale] ?? map['en'] ?? map['id'] ?? null;
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
        const notes = pickReleaseNotes(v.releaseNotes as unknown, locale);
        return (
          <li
            key={v.id}
            className="rounded-[16px] border border-line p-5 bg-surface"
          >
            <div className="flex flex-wrap items-center gap-3 justify-between">
              <div className="flex items-center gap-2">
                <VersionBadge semver={v.semver} isLatest={v.isLatest} />
                <span className="text-caption text-ink-3 geist-tnum">
                  {v.publishedAt
                    ? t('publishedAt', { when: formatDate(v.publishedAt, locale, { dateStyle: 'medium' }) })
                    : null}
                </span>
              </div>
              <div className="flex items-center gap-3 text-caption text-ink-3 geist-tnum">
                <span>{v.fileCount} files</span>
                <span aria-hidden>·</span>
                <span>{formatBytes(v.bytesTotal, locale)}</span>
                <Button size="sm" variant="secondary" onClick={() => onDownload(v.id)}>
                  {t('downloadThis')}
                </Button>
              </div>
            </div>
            {notes ? (
              <div className="mt-4 pt-4 border-t border-line">
                <TipTapRenderer doc={notes} variant="lite" />
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

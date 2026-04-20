'use client';

import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import type { CompatibilityRow, RenderPipeline, TargetPlatform } from '@/lib/api/types';

interface CompatibilityTableProps {
  rows: CompatibilityRow[];
  requiresEmptyProject?: boolean;
}

export function CompatibilityTable({ rows, requiresEmptyProject }: CompatibilityTableProps) {
  const t = useTranslations('asset.compatibility');
  const tSearch = useTranslations('search');

  return (
    <div className="space-y-4">
      {requiresEmptyProject ? (
        <Alert variant="warning" title={t('requiresEmptyProjectTitle')}>
          {t('requiresEmptyProjectBody')}
        </Alert>
      ) : null}
      <div className="overflow-x-auto rounded-[14px] border border-line">
        <table className="w-full border-collapse text-[14px]">
          <thead>
            <tr className="bg-surface-muted text-left">
              <th className="px-4 py-3 text-eyebrow uppercase tracking-[0.12em] text-ink-3 font-semibold">
                {t('engineVersion')}
              </th>
              <th className="px-4 py-3 text-eyebrow uppercase tracking-[0.12em] text-ink-3 font-semibold">
                {t('renderPipelines')}
              </th>
              <th className="px-4 py-3 text-eyebrow uppercase tracking-[0.12em] text-ink-3 font-semibold">
                {t('targets')}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-t border-line">
                <td className="px-4 py-3 align-top font-mono text-[13px] text-ink">
                  {row.engineVersion}
                </td>
                <td className="px-4 py-3 align-top">
                  <div className="flex flex-wrap gap-1.5">
                    {row.renderPipelines.length === 0 ? (
                      <span className="text-ink-3 text-caption">—</span>
                    ) : (
                      row.renderPipelines.map((rp) => (
                        <Badge key={rp} variant="info" size="sm">
                          {tSearch(`renderPipeline.${rp as RenderPipeline}`)}
                        </Badge>
                      ))
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 align-top">
                  <div className="flex flex-wrap gap-1.5">
                    {row.targets.map((tgt) => (
                      <Badge key={tgt} variant="neutral" size="sm">
                        {tSearch(`target.${tgt as TargetPlatform}`)}
                      </Badge>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

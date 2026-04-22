'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { ChipFilter } from '@/components/filters/filter-section';
import { useAuthedFetch } from '@/lib/api/client';
import { useWizard } from '../wizard-context';
import type { CompatibilityRow, Engine, RenderPipeline, TargetPlatform } from '@/lib/api/types';
import { logger } from '@/lib/logger';

// Per-engine pipeline catalogues. RenderPipeline values are stored as plain
// strings in Prisma, so the frontend is the source of truth for which
// per-engine options are surfaced in the chip selector. Engines that don't
// have a pipeline concept (audio, image, video, etc.) get an empty list and
// the pipeline row is hidden.
const RENDER_PIPELINES_BY_ENGINE: Record<Engine, RenderPipeline[]> = {
  UNITY: ['URP', 'HDRP', 'SRP', 'BUILT_IN'],
  UNREAL: ['LUMEN', 'NANITE', 'PATH_TRACING'],
  BLENDER: ['EEVEE', 'CYCLES'],
  STANDALONE_3D: [],
  AUDIO: [],
  IMAGE: [],
  VIDEO: [],
  OTHER: [],
  ENGINE_AGNOSTIC: [],
};

// Per-engine version-string suggestions surfaced as a <datalist>. The user
// can still type any string; the suggestions are just to keep the format
// recognisable across engines.
const VERSION_SUGGESTIONS_BY_ENGINE: Record<Engine, string[]> = {
  UNITY: ['6000.1.14f1', '6000.0.2f1', '2022.3.50f1', '2021.3.45f1'],
  UNREAL: ['5.0', '5.1', '5.2', '5.3', '5.4', '5.5'],
  BLENDER: ['4.2 LTS', '4.1', '4.0', '3.6 LTS'],
  STANDALONE_3D: ['FBX 2020', 'FBX 2019', 'glTF 2.0', 'USD 24.05', 'OBJ'],
  AUDIO: ['WAV PCM 16-bit', 'WAV PCM 24-bit', 'MP3 320', 'OGG Vorbis', 'FLAC'],
  IMAGE: ['PNG', 'JPEG', 'WebP', 'EXR 32-bit', 'TIFF'],
  VIDEO: ['MP4 H.264', 'MP4 H.265', 'MOV ProRes', 'WebM VP9'],
  OTHER: [],
  ENGINE_AGNOSTIC: [],
};

const ENGINE_LABEL: Record<Engine, string> = {
  UNITY: 'Unity',
  UNREAL: 'Unreal',
  BLENDER: 'Blender',
  STANDALONE_3D: '3D General',
  AUDIO: 'Audio',
  IMAGE: 'Image',
  VIDEO: 'Video',
  OTHER: 'Other engine',
  ENGINE_AGNOSTIC: 'Engine-agnostic',
};

const TARGETS: TargetPlatform[] = [
  'WINDOWS',
  'MAC',
  'LINUX',
  'IOS',
  'ANDROID',
  'CONSOLE',
  'WEB',
  'VR',
];

export function StepCompatibility() {
  const wiz = useWizard();
  const t = useTranslations('publish.compatibility');
  const tSearch = useTranslations('search');
  const fetcher = useAuthedFetch();
  const [rows, setRows] = useState<CompatibilityRow[]>(
    wiz.latestVersion?.compatibility ?? [],
  );

  // Keep local state in sync if the server payload changes (e.g. after refetch).
  useEffect(() => {
    if (wiz.latestVersion?.compatibility) setRows(wiz.latestVersion.compatibility);
  }, [wiz.latestVersion?.compatibility]);

  if (wiz.asset.engine === 'ENGINE_AGNOSTIC') {
    return <Alert variant="neutral">{t('agnostic')}</Alert>;
  }
  if (!wiz.latestVersion) {
    return <Alert variant="warning">Create a version first via Basics.</Alert>;
  }

  const persist = async (next: CompatibilityRow[]) => {
    setRows(next);
    try {
      await fetcher(`/assets/${wiz.asset.id}/versions/${wiz.latestVersion!.id}/compatibility`, {
        method: 'POST',
        body: { rows: next },
      });
      await wiz.refresh();
    } catch (err) {
      logger.warn('compatibility.save-failed', {
        err: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const suggested = VERSION_SUGGESTIONS_BY_ENGINE[wiz.asset.engine] ?? [];
  const versionLabel =
    wiz.asset.engine === 'UNITY' || wiz.asset.engine === 'UNREAL' || wiz.asset.engine === 'BLENDER'
      ? t('engineVersion')
      : `${ENGINE_LABEL[wiz.asset.engine]} format / version`;

  return (
    <div className="space-y-4 max-w-[820px]">
      <div>
        <h2 className="font-display text-h2 text-ink tracking-[-0.01em] mb-1">{t('title')}</h2>
      </div>

      {rows.length === 0 ? (
        <Alert variant="neutral">{t('noRows')}</Alert>
      ) : (
        <ul className="space-y-3">
          {rows.map((row, idx) => (
            <li key={idx} className="rounded-[14px] border border-line p-4 bg-surface">
              <div className="flex flex-wrap gap-4">
                <Field id={`ev-${idx}`} label={versionLabel} className="flex-1 min-w-[200px]">
                  <Input
                    id={`ev-${idx}`}
                    list={`engine-${wiz.asset.engine}`}
                    value={row.engineVersion}
                    onChange={(e) => {
                      const next = rows.map((r, i) =>
                        i === idx ? { ...r, engineVersion: e.target.value } : r,
                      );
                      setRows(next);
                    }}
                    onBlur={() => persist(rows)}
                  />
                  <datalist id={`engine-${wiz.asset.engine}`}>
                    {suggested.map((s) => (
                      <option key={s} value={s} />
                    ))}
                  </datalist>
                </Field>

                {RENDER_PIPELINES_BY_ENGINE[wiz.asset.engine]?.length ? (
                  <Field label={t('renderPipelines')} className="flex-[1.6] min-w-[260px]">
                    <ChipFilter
                      options={RENDER_PIPELINES_BY_ENGINE[wiz.asset.engine].map((rp) => ({
                        label: tSearch(`renderPipeline.${rp}`),
                        value: rp,
                      }))}
                      values={row.renderPipelines}
                      onChange={(next) => {
                        const updated = rows.map((r, i) =>
                          i === idx ? { ...r, renderPipelines: next as RenderPipeline[] } : r,
                        );
                        void persist(updated);
                      }}
                    />
                  </Field>
                ) : null}

                <Field label={t('targets')} className="flex-[2] min-w-[320px]">
                  <ChipFilter
                    options={TARGETS.map((tg) => ({
                      label: tSearch(`target.${tg}`),
                      value: tg,
                    }))}
                    values={row.targets}
                    onChange={(next) => {
                      const updated = rows.map((r, i) =>
                        i === idx ? { ...r, targets: next as TargetPlatform[] } : r,
                      );
                      void persist(updated);
                    }}
                  />
                </Field>

                <button
                  type="button"
                  aria-label={t('removeRow')}
                  onClick={() => void persist(rows.filter((_, i) => i !== idx))}
                  className="self-start inline-flex h-9 w-9 items-center justify-center rounded-[8px] text-ink-2 hover:bg-surface-muted hover:text-ink transition-colors"
                >
                  <X className="h-4 w-4" strokeWidth={2.25} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Button
        variant="secondary"
        leadingIcon={<Plus className="h-4 w-4" strokeWidth={2.25} />}
        onClick={() => {
          const defaultPipelines = RENDER_PIPELINES_BY_ENGINE[wiz.asset.engine];
          void persist([
            ...rows,
            {
              engineVersion: suggested[0] ?? '',
              renderPipelines: defaultPipelines?.length ? [defaultPipelines[0]] : [],
              targets: ['WINDOWS'],
            },
          ]);
        }}
      >
        {t('addRow')}
      </Button>
    </div>
  );
}

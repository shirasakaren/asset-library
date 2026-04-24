'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { X, FileBox, Image as ImageIcon, Music, Video as VideoIcon, EyeOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ThumbnailImage } from './thumbnail-image';
import {
  Modal,
  ModalPortal,
  ModalOverlay,
} from '@/components/ui/modal';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/components/ui/empty-state';

// Dynamically import model-viewer panel so the web-component bundle only
// downloads when there's actually a 3D asset to show.
const ModelViewerPanel = dynamic(
  () => import('./model-viewer').then((m) => m.ModelViewerPanel),
  { ssr: false, loading: () => <div className="absolute inset-0 skeleton" /> },
);

interface MediaItem {
  id: string;
  kind: 'image' | 'video' | 'audio' | '3d';
  url: string;
  /** Full-resolution URL opened in the lightbox (falls back to `url`). */
  fullUrl?: string;
  thumb?: string | null;
  label?: string;
  /** Sensitive media: blurred until the viewer clicks to reveal. */
  blur?: boolean;
  warning?: string;
  meta?: { animations?: string[] };
}

interface MediaGalleryProps {
  thumbnailUrl?: string | null;
  thumbnailFallback?: string | null;
  items: MediaItem[];
  assetTitle: string;
}

function classifyKind(kind: string): MediaItem['kind'] | null {
  const k = kind.toUpperCase();
  if (k === 'GLB') return '3d';
  if (k.includes('AUDIO')) return 'audio';
  if (k.includes('VIDEO')) return 'video';
  if (k.includes('TEXTURE') || k === 'SPRITE' || k.includes('IMAGE')) return 'image';
  return null;
}

export function classifyFiles(
  files: { id: string; relativePath: string; kind: string; meta?: Record<string, unknown> | null }[],
): MediaItem[] {
  return files
    .map((f): MediaItem | null => {
      const kind = classifyKind(f.kind);
      if (!kind) return null;
      const meta = (f.meta ?? {}) as Record<string, unknown>;
      // The backend attaches a signed `viewUrl` to viewable media via the
      // editor-media flow (90-day signed GETs) and to derived GLB previews
      // via the converter. Without one, we can't render a preview at all
      // — skip the entry so the gallery doesn't show a broken tile.
      const viewUrl = typeof meta.viewUrl === 'string' ? (meta.viewUrl as string) : null;
      if (!viewUrl) return null;
      const thumbUrl = typeof meta.thumbUrl === 'string' ? (meta.thumbUrl as string) : null;
      const animations = Array.isArray(meta.animations) ? (meta.animations as string[]) : undefined;
      return {
        id: f.id,
        kind,
        url: viewUrl,
        thumb: thumbUrl,
        label: f.relativePath.split('/').pop() ?? f.relativePath,
        meta: animations ? { animations } : undefined,
      };
    })
    .filter((m): m is MediaItem => m !== null);
}

const kindIcon = {
  image: ImageIcon,
  video: VideoIcon,
  audio: Music,
  '3d': FileBox,
} as const;

export function MediaGallery({
  thumbnailUrl,
  thumbnailFallback,
  items,
  assetTitle,
}: MediaGalleryProps) {
  const t = useTranslations('asset.viewer');
  const [activeId, setActiveId] = useState<string | null>(items[0]?.id ?? null);
  const [lightbox, setLightbox] = useState<MediaItem | null>(null);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());

  const active = useMemo(() => items.find((i) => i.id === activeId) ?? items[0] ?? null, [activeId, items]);
  const activeHidden = !!active?.blur && !revealed.has(active.id);
  const reveal = (id: string) => setRevealed((s) => new Set(s).add(id));

  if (items.length === 0) {
    return (
      <div className="relative aspect-[16/9] rounded-[24px] border border-line overflow-hidden bg-surface-muted">
        <ThumbnailImage
          src={thumbnailUrl}
          fallback={thumbnailFallback}
          alt={assetTitle}
          className="!rounded-[24px]"
        />
      </div>
    );
  }

  return (
    <div>
      <div className="relative aspect-[16/9] rounded-[24px] overflow-hidden border border-line bg-surface-muted">
        {active?.kind === 'image' ? (
          <button
            type="button"
            onClick={() => (activeHidden ? reveal(active.id) : setLightbox(active))}
            className="absolute inset-0 cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
            aria-label={`${active.label ?? assetTitle} — open lightbox`}
          >
            <Image
              src={active.url}
              alt={active.label ?? assetTitle}
              fill
              priority
              sizes="(min-width: 1024px) 800px, 100vw"
              className={cn('object-contain transition', activeHidden && 'blur-2xl scale-110')}
              unoptimized
            />
            {activeHidden ? (
              <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center px-6 bg-ink/30">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-ink/80 text-white">
                  <EyeOff className="h-5 w-5" strokeWidth={2.25} />
                </span>
                <span className="text-[14px] font-semibold text-white drop-shadow">
                  {active.warning?.trim() || 'Sensitive content'}
                </span>
                <span className="text-[12px] text-white/85">Click to reveal</span>
              </span>
            ) : null}
          </button>
        ) : active?.kind === 'video' ? (
          <video
            key={active.url}
            controls
            preload="metadata"
            poster={active.thumb ?? undefined}
            className="absolute inset-0 h-full w-full object-contain bg-black"
          >
            <source src={active.url} />
          </video>
        ) : active?.kind === 'audio' ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 p-8">
            <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-brand-blue-50 text-brand-blue">
              <Music className="h-8 w-8" strokeWidth={2.25} />
            </div>
            <p className="text-h3 font-display text-ink tracking-[-0.005em]">{active.label}</p>
            <audio controls src={active.url} className="w-full max-w-[420px]" />
          </div>
        ) : active?.kind === '3d' ? (
          <ModelViewerPanel
            src={active.url}
            alt={active.label ?? assetTitle}
            poster={active.thumb ?? thumbnailUrl ?? thumbnailFallback ?? null}
            animations={active.meta?.animations ?? []}
          />
        ) : (
          <EmptyState
            title={t('noPreview')}
            pattern={false}
            className="!py-0 absolute inset-0 !justify-center"
          />
        )}
      </div>

      {items.length > 1 ? (
        <div
          className={cn(
            'mt-3 flex gap-2 overflow-x-auto pb-1',
            '[-ms-overflow-style:none] [scrollbar-width:none]',
            '[&::-webkit-scrollbar]:hidden',
          )}
          role="tablist"
          aria-label="Media thumbnails"
        >
          {items.map((item) => {
            const Icon = kindIcon[item.kind];
            const selected = item.id === activeId;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setActiveId(item.id)}
                className={cn(
                  'group relative shrink-0 h-[60px] w-[100px] overflow-hidden rounded-[10px] border bg-surface-muted',
                  selected ? 'border-brand-blue ring-2 ring-brand-blue/40' : 'border-line hover:border-ink/30',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2',
                )}
              >
                {item.kind === 'image' && item.url ? (
                  <Image src={item.url} alt="" fill sizes="100px" className="object-cover" unoptimized />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-ink-2">
                    <Icon className="h-4 w-4" strokeWidth={2.25} />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      ) : null}

      {/* Lightbox */}
      <Modal open={!!lightbox} onOpenChange={(o) => !o && setLightbox(null)}>
        <ModalPortal>
          <ModalOverlay className="!bg-ink/85 !backdrop-blur-[6px]" />
          <DialogPrimitive.Content
            className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-[calc(100vw-2rem)] h-[calc(100vh-2rem)] max-w-[1280px] outline-none data-[state=open]:animate-fade-in"
          >
            {lightbox?.kind === 'image' ? (
              <Image
                src={lightbox.fullUrl ?? lightbox.url}
                alt={lightbox.label ?? assetTitle}
                fill
                sizes="100vw"
                className="object-contain"
                unoptimized
              />
            ) : null}
            <DialogPrimitive.Close
              aria-label="Close lightbox"
              className="absolute top-4 right-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25 transition-colors backdrop-blur-[8px]"
            >
              <X className="h-4 w-4" strokeWidth={2.25} />
            </DialogPrimitive.Close>
          </DialogPrimitive.Content>
        </ModalPortal>
      </Modal>
    </div>
  );
}

// Re-export type so the asset detail page can build the items list.
export type { MediaItem };

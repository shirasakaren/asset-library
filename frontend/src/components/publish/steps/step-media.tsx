'use client';

import { useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ImagePlus,
  Music,
  Video as VideoIcon,
  FileBox,
  Loader2,
  X,
  GripVertical,
  Settings2,
  EyeOff,
  Eye,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalFooter,
} from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/toaster';
import { useWizard } from '../wizard-context';
import { useAuthedFetch } from '@/lib/api/client';
import { uploadEditorMedia } from '@/components/rich-text/editor-media-upload';
import { putWithProgress } from '@/lib/upload/put-with-progress';
import { compressImage } from '@/lib/image/compress';
import type { PreviewMediaItem, PreviewMediaVisibility } from '@/lib/api/types';
import { cn } from '@/lib/utils';

interface InitiateThumb {
  putUrl: string;
  key: string;
  expiresAt: string;
}

export function StepMedia() {
  const wiz = useWizard();
  const t = useTranslations('publish.media');
  const fetcher = useAuthedFetch();
  const { data: session } = useSession();
  const [uploadingThumb, setUploadingThumb] = useState(false);
  const [thumbProgress, setThumbProgress] = useState<number | null>(null);
  const [uploadingPreview, setUploadingPreview] = useState(false);
  const [previewProgress, setPreviewProgress] = useState<number | null>(null);
  const [localThumbUrl, setLocalThumbUrl] = useState<string | null>(null);
  const thumbInputRef = useRef<HTMLInputElement | null>(null);
  const previewInputRef = useRef<HTMLInputElement | null>(null);
  const [previewKind, setPreviewKind] = useState<'image' | 'video' | 'audio' | '3d' | null>(null);
  const [settingsItem, setSettingsItem] = useState<PreviewMediaItem | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  useEffect(() => {
    return () => {
      if (localThumbUrl) URL.revokeObjectURL(localThumbUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleThumb = async (raw: File) => {
    setUploadingThumb(true);
    setThumbProgress(0);
    // Compress thumbnails aggressively — they're only ever shown small. The
    // compressed copy is what we store (no full-res needed for the card/hero).
    const file = await compressImage(raw, { maxDimension: 1280, quality: 0.8 });
    const objectUrl = URL.createObjectURL(file);
    const previousLocal = localThumbUrl;
    setLocalThumbUrl(objectUrl);
    if (previousLocal) URL.revokeObjectURL(previousLocal);
    try {
      const initiate = await fetcher<InitiateThumb>('/files/thumbnails/initiate', {
        method: 'POST',
        body: {
          assetId: wiz.asset.id,
          contentType: file.type || 'image/webp',
          bytes: file.size,
        },
      });
      await putWithProgress({
        url: initiate.putUrl,
        body: file,
        contentType: file.type || 'image/webp',
        onProgress: (loaded, total) =>
          setThumbProgress(total ? Math.min(100, Math.round((loaded / total) * 100)) : null),
      });
      await fetcher('/files/thumbnails/complete', {
        method: 'POST',
        body: { assetId: wiz.asset.id, key: initiate.key },
      });
      await wiz.refresh();
    } catch (err) {
      toast.error('Thumbnail upload failed', {
        description: err instanceof Error ? err.message : String(err),
      });
      setLocalThumbUrl(null);
      URL.revokeObjectURL(objectUrl);
    } finally {
      setUploadingThumb(false);
      setThumbProgress(null);
    }
  };

  const handlePreviewMedia = async (file: File) => {
    setUploadingPreview(true);
    setPreviewProgress(0);
    const kind = previewKind ?? 'image';
    try {
      let item: PreviewMediaItem;
      if (kind === 'image') {
        // Dual upload: a compressed display copy (fast gallery loads) and the
        // untouched original (full-resolution click-through).
        const display = await compressImage(file, { maxDimension: 1600, quality: 0.82 });
        const compressed = await uploadEditorMedia(display, session?.accessToken, {
          onProgress: (loaded, total) =>
            setPreviewProgress(total ? Math.min(50, Math.round((loaded / total) * 50)) : null),
        });
        const original = await uploadEditorMedia(file, session?.accessToken, {
          onProgress: (loaded, total) =>
            setPreviewProgress(total ? 50 + Math.min(50, Math.round((loaded / total) * 50)) : null),
        });
        item = {
          id: cryptoRandomId(),
          kind: 'image',
          key: original.key,
          displayKey: compressed.key,
          viewUrl: compressed.viewUrl,
          originalUrl: original.viewUrl,
          label: file.name,
          mime: file.type,
          visibility: 'visible',
        };
      } else {
        const up = await uploadEditorMedia(file, session?.accessToken, {
          onProgress: (loaded, total) =>
            setPreviewProgress(total ? Math.min(100, Math.round((loaded / total) * 100)) : null),
        });
        item = {
          id: cryptoRandomId(),
          kind,
          key: up.key,
          viewUrl: up.viewUrl,
          label: file.name,
          mime: file.type,
          visibility: 'visible',
        };
      }
      wiz.patch({ previewMedia: [...(wiz.asset.previewMedia ?? []), item] });
    } catch (err) {
      toast.error('Upload failed', {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setUploadingPreview(false);
      setPreviewProgress(null);
      setPreviewKind(null);
    }
  };

  const previewMedia: PreviewMediaItem[] = wiz.asset.previewMedia ?? [];

  const removePreview = (id: string) => {
    wiz.patch({ previewMedia: previewMedia.filter((m) => m.id !== id) });
  };

  const reorder = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = previewMedia.findIndex((m) => m.id === active.id);
    const newIdx = previewMedia.findIndex((m) => m.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    wiz.patch({ previewMedia: arrayMove(previewMedia, oldIdx, newIdx) });
  };

  const saveSettings = (id: string, patch: Partial<PreviewMediaItem>) => {
    wiz.patch({
      previewMedia: previewMedia.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    });
  };

  const thumbUrl =
    wiz.asset.thumbnail.url ?? localThumbUrl ?? wiz.asset.thumbnailAutoGenerated?.url ?? null;

  return (
    <div className="space-y-10 max-w-[760px]">
      <section>
        <h2 className="font-display text-h2 text-ink tracking-[-0.01em] mb-2">{t('thumbnailTitle')}</h2>
        <p className="text-body-sm text-ink-3 mb-4">{t('thumbnailHelper')}</p>
        <div className="relative aspect-[16/9] max-w-[640px] rounded-[20px] border border-line overflow-hidden bg-surface-muted">
          {thumbUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={thumbUrl} alt="Thumbnail preview" className="absolute inset-0 h-full w-full object-cover" />
              {uploadingThumb ? (
                <div className="absolute inset-0 bg-ink/55 backdrop-blur-[4px] flex flex-col items-center justify-center text-white gap-3 px-6">
                  <div className="inline-flex items-center gap-2 text-[13px] font-medium">
                    <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.25} />
                    Uploading{thumbProgress != null ? ` · ${thumbProgress}%` : '…'}
                  </div>
                  <div className="w-full max-w-[260px] h-1.5 rounded-full bg-white/25 overflow-hidden">
                    <div className="h-full bg-white transition-[width] duration-150" style={{ width: `${thumbProgress ?? 0}%` }} />
                  </div>
                </div>
              ) : null}
              <div className="absolute bottom-3 right-3 flex items-center gap-2">
                <Button variant="secondary" size="sm" onClick={() => thumbInputRef.current?.click()}>
                  {t('replace')}
                </Button>
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={() => thumbInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) void handleThumb(f);
              }}
              className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-ink-3 hover:text-ink hover:bg-surface-muted/40 transition-colors duration-120"
            >
              {uploadingThumb ? (
                <>
                  <Loader2 className="h-6 w-6 animate-spin" strokeWidth={2.25} />
                  <span className="text-[13px] font-medium text-ink">
                    Uploading{thumbProgress != null ? ` · ${thumbProgress}%` : '…'}
                  </span>
                </>
              ) : (
                <>
                  <ImagePlus className="h-6 w-6" strokeWidth={2.25} />
                  <span className="text-[14px] font-medium">{t('thumbnailDrop')}</span>
                </>
              )}
            </button>
          )}
        </div>
        <input
          ref={thumbInputRef}
          type="file"
          hidden
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => {
            const f = e.currentTarget.files?.[0];
            e.currentTarget.value = '';
            if (f) void handleThumb(f);
          }}
        />
      </section>

      <section>
        <h2 className="font-display text-h2 text-ink tracking-[-0.01em] mb-2">{t('previewMediaTitle')}</h2>
        <p className="text-body-sm text-ink-3 mb-4">{t('previewMediaHelper')}</p>
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <AddButton icon={ImagePlus} onClick={() => { setPreviewKind('image'); previewInputRef.current?.click(); }} label={t('addImage')} />
          <AddButton icon={VideoIcon} onClick={() => { setPreviewKind('video'); previewInputRef.current?.click(); }} label={t('addVideo')} />
          <AddButton icon={Music} onClick={() => { setPreviewKind('audio'); previewInputRef.current?.click(); }} label={t('addAudio')} />
          <AddButton icon={FileBox} onClick={() => { setPreviewKind('3d'); previewInputRef.current?.click(); }} label={t('add3d')} />
          {uploadingPreview ? (
            <span className="inline-flex items-center gap-2 text-caption text-ink-3">
              <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.25} />
              <span>{t('uploading')}{previewProgress != null ? ` · ${previewProgress}%` : ''}</span>
              <span className="w-24 h-1 rounded-full bg-line overflow-hidden align-middle">
                <span className="block h-full bg-brand-blue transition-[width] duration-150" style={{ width: `${previewProgress ?? 0}%` }} />
              </span>
            </span>
          ) : null}
        </div>
        <input
          ref={previewInputRef}
          type="file"
          hidden
          accept={
            previewKind === 'image' ? 'image/*'
              : previewKind === 'video' ? 'video/*'
                : previewKind === 'audio' ? 'audio/*'
                  : previewKind === '3d' ? '.glb,.fbx,.obj'
                    : undefined
          }
          onChange={(e) => {
            const f = e.currentTarget.files?.[0];
            e.currentTarget.value = '';
            if (f) void handlePreviewMedia(f);
          }}
        />
        {previewMedia.length === 0 ? (
          <div className="rounded-[14px] border border-dashed border-line bg-surface-muted/30 p-8 text-center text-body-sm text-ink-3">
            No preview media yet. Use the buttons above to upload images, video, audio, or 3D files.
          </div>
        ) : (
          <>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={reorder}>
              <SortableContext items={previewMedia.map((m) => m.id)} strategy={rectSortingStrategy}>
                <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {previewMedia.map((m, i) => (
                    <PreviewMediaCard
                      key={m.id}
                      item={m}
                      index={i}
                      onRemove={() => removePreview(m.id)}
                      onSettings={() => setSettingsItem(m)}
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
            <p className="mt-2 text-caption text-ink-3">
              Drag tiles to reorder slides. Use the gear to blur or hide sensitive media.
            </p>
          </>
        )}
      </section>

      {settingsItem ? (
        <MediaSettingsModal
          item={settingsItem}
          onClose={() => setSettingsItem(null)}
          onSave={(patch) => {
            saveSettings(settingsItem.id, patch);
            setSettingsItem(null);
          }}
        />
      ) : null}
    </div>
  );
}

function PreviewMediaCard({
  item,
  index,
  onRemove,
  onSettings,
}: {
  item: PreviewMediaItem;
  index: number;
  onRemove: () => void;
  onSettings: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });
  const blurred = item.visibility === 'blur';
  const hidden = item.visibility === 'hidden';
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'relative rounded-[12px] overflow-hidden border border-line bg-surface-muted group',
        item.kind === 'audio' ? '' : 'aspect-[16/9]',
        isDragging && 'opacity-80 shadow-2 z-10',
      )}
    >
      <span className="absolute top-1.5 left-1.5 z-20 inline-flex h-6 min-w-6 px-1.5 items-center justify-center rounded-full bg-ink/70 text-white text-[10px] font-semibold geist-tnum">
        {index + 1}
      </span>
      <button
        {...attributes}
        {...listeners}
        type="button"
        aria-label="Drag to reorder"
        className="absolute top-1.5 left-1/2 -translate-x-1/2 z-20 inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/80 backdrop-blur-[6px] text-ink-2 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing touch-none"
      >
        <GripVertical className="h-3.5 w-3.5" strokeWidth={2.25} />
      </button>

      <div className={cn('absolute inset-0', blurred && 'blur-xl scale-110')}>
        {item.kind === 'image' ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.viewUrl} alt={item.label} className="absolute inset-0 h-full w-full object-cover" />
        ) : item.kind === 'video' ? (
          <video src={item.viewUrl} controls={!blurred} preload="metadata" className="absolute inset-0 h-full w-full object-contain bg-ink" />
        ) : item.kind === 'audio' ? (
          <div className="p-3 flex flex-col gap-2">
            <div className="inline-flex items-center gap-2 text-caption text-ink-2">
              <Music className="h-4 w-4" strokeWidth={2.25} />
              <span className="font-medium text-ink truncate">{item.label}</span>
            </div>
            <audio src={item.viewUrl} controls preload="metadata" className="w-full" />
          </div>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-ink-3 px-4 text-center">
            <FileBox className="h-6 w-6" strokeWidth={2.25} />
            <span className="text-[12.5px] font-medium text-ink truncate max-w-full">{item.label}</span>
            <span className="text-caption">3D model</span>
          </div>
        )}
      </div>

      {(blurred || hidden) && item.kind !== 'audio' ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-center px-4 pointer-events-none">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-ink/70 text-white">
            <EyeOff className="h-4 w-4" strokeWidth={2.25} />
          </span>
          <span className="text-[12px] font-semibold text-white drop-shadow">
            {hidden ? 'Hidden' : item.warning?.trim() || 'Sensitive content'}
          </span>
        </div>
      ) : null}

      <div className="absolute top-1.5 right-1.5 z-20 flex items-center gap-1">
        <button
          type="button"
          aria-label="Media settings"
          onClick={onSettings}
          className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/90 backdrop-blur-[6px] text-ink-2 hover:text-ink shadow-1"
        >
          <Settings2 className="h-3.5 w-3.5" strokeWidth={2.25} />
        </button>
        <button
          type="button"
          aria-label="Remove"
          onClick={onRemove}
          className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/90 backdrop-blur-[6px] text-ink-2 hover:text-brand-red shadow-1"
        >
          <X className="h-3.5 w-3.5" strokeWidth={2.25} />
        </button>
      </div>
      <span className="absolute bottom-1.5 left-1.5 z-20 text-[10px] uppercase tracking-[0.1em] text-white bg-ink/65 px-1.5 py-0.5 rounded-[4px]">
        {item.kind}
      </span>
    </li>
  );
}

function MediaSettingsModal({
  item,
  onClose,
  onSave,
}: {
  item: PreviewMediaItem;
  onClose: () => void;
  onSave: (patch: Partial<PreviewMediaItem>) => void;
}) {
  const [visibility, setVisibility] = useState<PreviewMediaVisibility>(item.visibility ?? 'visible');
  const [warning, setWarning] = useState(item.warning ?? '');

  const options: { value: PreviewMediaVisibility; label: string; desc: string; icon: typeof Eye }[] = [
    { value: 'visible', label: 'Visible', desc: 'Shown normally to everyone.', icon: Eye },
    { value: 'blur', label: 'Blur + warning', desc: 'Blurred with a label; viewers click to reveal.', icon: EyeOff },
    { value: 'hidden', label: 'Hidden', desc: 'Not shown in the gallery at all.', icon: EyeOff },
  ];

  return (
    <Modal open onOpenChange={(o) => !o && onClose()}>
      <ModalContent size="sm">
        <ModalHeader>
          <ModalTitle>Media display settings</ModalTitle>
          <ModalDescription>Control how this item appears on the asset page.</ModalDescription>
        </ModalHeader>
        <div className="space-y-2">
          {options.map((opt) => {
            const Icon = opt.icon;
            const active = visibility === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setVisibility(opt.value)}
                className={cn(
                  'w-full flex items-start gap-3 p-3 rounded-[12px] border text-left transition-colors',
                  active ? 'border-ink bg-surface-muted/60' : 'border-line hover:border-ink/40',
                )}
              >
                <Icon className="h-4 w-4 mt-0.5 text-ink-2 shrink-0" strokeWidth={2.25} />
                <span className="min-w-0">
                  <span className="block text-[14px] font-medium text-ink">{opt.label}</span>
                  <span className="block text-caption text-ink-3">{opt.desc}</span>
                </span>
              </button>
            );
          })}
        </div>
        {visibility === 'blur' ? (
          <div className="mt-3">
            <label className="block text-caption font-medium text-ink-2 mb-1">Warning label</label>
            <Input
              value={warning}
              onChange={(e) => setWarning(e.target.value)}
              maxLength={120}
              placeholder="e.g. NSFW — contains nudity"
            />
          </div>
        ) : null}
        <ModalFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              onSave({ visibility, warning: visibility === 'blur' ? warning.trim() || undefined : undefined })
            }
          >
            Save
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

function AddButton({
  icon: Icon,
  onClick,
  label,
}: {
  icon: typeof ImagePlus;
  onClick: () => void;
  label: string;
}) {
  return (
    <Button variant="secondary" size="sm" onClick={onClick} leadingIcon={<Icon className="h-4 w-4" strokeWidth={2.25} />}>
      {label}
    </Button>
  );
}

function cryptoRandomId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2);
}

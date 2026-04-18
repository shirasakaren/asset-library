'use client';

import { useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
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
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Upload,
  FileBox,
  FolderUp,
  RefreshCcw,
  X,
  Check,
  Loader2,
  GripVertical,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert } from '@/components/ui/alert';
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
import { useUploadStore, LARGE_FILE_WARN_BYTES } from '@/lib/upload/upload-store';
import { formatBytes } from '@/lib/format';
import type { LocaleCode } from '@/lib/api/types';
import type { UploadStatus, UploadTask } from '@/lib/upload/types';
import { cn } from '@/lib/utils';

interface SavedFile {
  id: string;
  relativePath: string;
  bytes: number;
}

export function StepFiles() {
  const wiz = useWizard();
  const t = useTranslations('publish.files');
  const locale = useLocale() as LocaleCode;
  const fetcher = useAuthedFetch();
  const fileInput = useRef<HTMLInputElement | null>(null);
  const dirInput = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SavedFile | null>(null);

  const versionId = wiz.latestVersion?.id ?? '';
  const assetId = wiz.asset.id;

  const addToStore = useUploadStore((s) => s.addFiles);
  const cancel = useUploadStore((s) => s.cancel);
  const retry = useUploadStore((s) => s.retry);
  const dismissByFileId = useUploadStore((s) => s.dismissByFileId);
  // Select stable refs and derive the filtered list in render. A selector
  // that returned `.map().filter()` each call broke Zustand's identity check
  // and caused React error #185 (infinite re-render).
  const tasksMap = useUploadStore((s) => s.tasks);
  const order = useUploadStore((s) => s.order);
  const tasks = order
    .map((id) => tasksMap[id])
    .filter(
      (t): t is NonNullable<typeof t> =>
        !!t && t.input.assetId === assetId && t.input.versionId === versionId,
    );

  // Saved server files, locally reorderable. Seed from the asset payload; the
  // user can drag to reorder before persisting.
  const serverFiles = useMemo<SavedFile[]>(
    () =>
      (wiz.latestVersion?.files ?? []).map((f) => ({
        id: f.id,
        relativePath: f.relativePath,
        bytes: Number(f.bytes ?? 0),
      })),
    [wiz.latestVersion?.files],
  );
  const [orderedSaved, setOrderedSaved] = useState<SavedFile[]>(serverFiles);
  // Re-seed when the server set changes (new upload finished / reload).
  const serverIds = serverFiles.map((f) => f.id).join(',');
  const seededRef = useRef('');
  if (seededRef.current !== serverIds) {
    seededRef.current = serverIds;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    if (orderedSaved.map((f) => f.id).join(',') !== serverIds) setOrderedSaved(serverFiles);
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const savedTaskFileIds = new Set(tasks.map((tk) => tk.fileId).filter(Boolean) as string[]);
  // Tasks still actively shown (not yet reflected as a saved file row).
  const activeTasks = tasks.filter(
    (tk) => !tk.fileId || !orderedSaved.some((f) => f.id === tk.fileId),
  );

  const addFiles = (files: File[], stripBase = false) => {
    if (files.some((f) => f.size > LARGE_FILE_WARN_BYTES)) {
      toast.info('Large upload', {
        description:
          'One or more files are over 2 GB. The upload will continue in the background — you can keep editing while it finishes.',
      });
    }
    const items = files.map((f) => {
      const raw = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
      const path = raw.replace(/\\/g, '/');
      const relativePath = stripBase ? path.split('/').slice(1).join('/') || path : path;
      return { file: f, relativePath };
    });
    addToStore(assetId, versionId, items);
  };

  const persistOrder = async (next: SavedFile[]) => {
    setOrderedSaved(next);
    try {
      await fetcher(`/files/versions/${versionId}/reorder`, {
        method: 'POST',
        body: { orderedFileIds: next.map((f) => f.id) },
      });
    } catch (err) {
      toast.error('Could not save order', {
        description: err instanceof Error ? err.message : String(err),
      });
      setOrderedSaved(serverFiles);
    }
  };

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = orderedSaved.findIndex((f) => f.id === active.id);
    const newIdx = orderedSaved.findIndex((f) => f.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    void persistOrder(arrayMove(orderedSaved, oldIdx, newIdx));
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await fetcher(`/files/${deleteTarget.id}`, { method: 'DELETE' });
      setOrderedSaved((cur) => cur.filter((f) => f.id !== deleteTarget.id));
      // Drop the finished upload task for this file too. Otherwise it lingers in
      // the global store and re-surfaces as an active row the instant the saved
      // file leaves orderedSaved — which is why deleted files appeared to stay
      // until a reload cleared the in-memory store.
      dismissByFileId(deleteTarget.id);
      toast.success('File deleted');
      void wiz.refresh();
    } catch (err) {
      toast.error('Could not delete file', {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setDeleteTarget(null);
    }
  };

  if (!wiz.latestVersion) {
    return (
      <Alert variant="warning">
        Create a version first by filling out Basics — semver is required.
      </Alert>
    );
  }

  const visibleSaved = orderedSaved.filter((f) => !savedTaskFileIds.has(f.id) || true);
  const totalBytes =
    visibleSaved.reduce((a, f) => a + f.bytes, 0) +
    activeTasks.reduce((a, tk) => a + tk.totalBytes, 0);
  const totalCount = visibleSaved.length + activeTasks.length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-1 font-display text-h2 tracking-[-0.01em] text-ink">{t('title')}</h2>
        <p className="text-body-sm text-ink-3">{t('subtitle')}</p>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const files = Array.from(e.dataTransfer.files ?? []);
          if (files.length) addFiles(files);
        }}
        className={cn(
          'bg-surface-muted/40 rounded-[16px] border-2 border-dashed p-8 text-center transition-colors duration-120',
          dragging ? 'bg-surface-muted/70 border-ink' : 'border-line',
        )}
      >
        <Upload className="mx-auto h-7 w-7 text-ink-3" strokeWidth={2.25} />
        <p className="mt-3 text-body font-medium text-ink">{t('drop')}</p>
        <p className="text-caption text-ink-3">{t('or')}</p>
        <div className="mt-3 inline-flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => fileInput.current?.click()}
            leadingIcon={<Upload className="h-4 w-4" strokeWidth={2.25} />}
          >
            {t('browseFiles')}
          </Button>
          <Button
            variant="ghost"
            onClick={() => dirInput.current?.click()}
            leadingIcon={<FolderUp className="h-4 w-4" strokeWidth={2.25} />}
          >
            {t('browseFolder')}
          </Button>
        </div>
        <p className="mt-3 text-caption text-ink-4">
          Any file size is supported. Uploads continue in the background while you edit.
        </p>
        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            const fs = Array.from(e.currentTarget.files ?? []);
            e.currentTarget.value = '';
            if (fs.length) addFiles(fs);
          }}
        />
        <input
          ref={dirInput}
          type="file"
          hidden
          multiple
          // @ts-expect-error directory picker isn't in the standard typings
          webkitdirectory=""
          directory=""
          onChange={(e) => {
            const fs = Array.from(e.currentTarget.files ?? []);
            e.currentTarget.value = '';
            if (fs.length) addFiles(fs, true);
          }}
        />
      </div>

      {totalCount > 0 ? (
        <div className="overflow-hidden rounded-[14px] border border-line bg-surface">
          {/* In-flight uploads (not yet persisted) — not reorderable. */}
          {activeTasks.length > 0 ? (
            <ul className="divide-y divide-line">
              {activeTasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  locale={locale}
                  onCancel={() => cancel(task.id)}
                  onRetry={() => retry(task.id)}
                />
              ))}
            </ul>
          ) : null}

          {/* Saved files — drag to reorder, gear/trash to delete. */}
          {visibleSaved.length > 0 ? (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext
                items={visibleSaved.map((f) => f.id)}
                strategy={verticalListSortingStrategy}
              >
                <ul
                  className={cn(
                    'divide-y divide-line',
                    activeTasks.length > 0 && 'border-t border-line',
                  )}
                >
                  {visibleSaved.map((f) => (
                    <SavedRow
                      key={f.id}
                      file={f}
                      locale={locale}
                      onDelete={() => setDeleteTarget(f)}
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          ) : null}

          <div className="geist-tnum flex items-center justify-between border-t border-line px-4 py-2.5 text-caption text-ink-3">
            <span>{totalCount} files</span>
            <span>{t('totalBytes', { size: formatBytes(totalBytes, locale) })}</span>
          </div>
        </div>
      ) : null}

      {visibleSaved.length > 1 ? (
        <p className="text-caption text-ink-3">
          Drag the handle to reorder how files appear on the asset page.
        </p>
      ) : null}

      <label className="hover:border-ink/40 inline-flex max-w-[640px] cursor-pointer items-start gap-3 rounded-[12px] border border-line p-3 transition-colors duration-120">
        <Checkbox
          checked={wiz.latestVersion.requiresEmptyProject}
          onCheckedChange={(c) => wiz.patch({ requiresEmptyProject: c === true })}
        />
        <div>
          <p className="text-[14px] font-medium text-ink">{t('requiresEmptyProjectLabel')}</p>
          <p className="mt-0.5 text-caption text-ink-3">{t('requiresEmptyProjectHint')}</p>
        </div>
      </label>

      {deleteTarget ? (
        <DeleteFileModal
          file={deleteTarget}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
        />
      ) : null}
    </div>
  );
}

function SavedRow({
  file,
  locale,
  onDelete,
}: {
  file: SavedFile;
  locale: LocaleCode;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: file.id,
  });
  const name = file.relativePath.split('/').pop() || file.relativePath;
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'flex items-center gap-3 bg-surface p-3',
        isDragging && 'rounded-[10px] opacity-70 shadow-2',
      )}
    >
      <button
        {...attributes}
        {...listeners}
        type="button"
        aria-label="Drag to reorder"
        className="cursor-grab touch-none text-ink-3 hover:text-ink active:cursor-grabbing"
      >
        <GripVertical className="h-4 w-4" strokeWidth={2.25} />
      </button>
      <div className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] bg-brand-green-50 text-brand-green">
        <Check className="h-4 w-4" strokeWidth={2.5} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <span className="truncate text-[13.5px] font-medium text-ink" title={file.relativePath}>
            {name}
          </span>
          <span className="geist-tnum shrink-0 text-caption text-ink-3">
            {formatBytes(file.bytes, locale)}
          </span>
        </div>
        <p className="mt-1 inline-flex items-center gap-1 text-caption font-medium text-brand-green">
          <Check className="h-3 w-3" strokeWidth={2.5} /> Uploaded
        </p>
      </div>
      <button
        type="button"
        onClick={onDelete}
        aria-label="Delete file"
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] text-ink-3 transition-colors hover:bg-brand-red-50 hover:text-brand-red"
      >
        <Trash2 className="h-4 w-4" strokeWidth={2.25} />
      </button>
    </li>
  );
}

function TaskRow({
  task,
  locale,
  onCancel,
  onRetry,
}: {
  task: UploadTask;
  locale: LocaleCode;
  onCancel: () => void;
  onRetry: () => void;
}) {
  const pct = task.totalBytes
    ? Math.min(100, Math.round((task.bytesUploaded / task.totalBytes) * 100))
    : 0;
  const isDone = task.status === 'analyzing' || task.status === 'ready';
  const isFailed = task.status === 'failed' || task.status === 'cancelled';
  return (
    <li className="flex items-center gap-3 p-3">
      <div className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] bg-surface-muted text-ink-2">
        <FileBox className="h-4 w-4" strokeWidth={2.25} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <span className="truncate text-[13.5px] font-medium text-ink">
            {task.input.relativePath}
          </span>
          <span className="geist-tnum shrink-0 text-caption text-ink-3">
            {formatBytes(task.totalBytes, locale)}
            {task.status === 'uploading' ? ` · ${pct}%` : ''}
          </span>
        </div>
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-line">
          <div
            className={cn(
              'h-full transition-all duration-200',
              isFailed ? 'bg-brand-red/70' : isDone ? 'bg-brand-green' : 'bg-brand-blue',
            )}
            style={{ width: `${isDone ? 100 : pct}%` }}
          />
        </div>
        <div className="mt-1.5 flex items-center gap-2 text-caption text-ink-3">
          <TaskStatusPill status={task.status} />
          {task.error ? <span className="truncate text-brand-red">· {task.error}</span> : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {task.status === 'failed' ? (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] text-ink-2 transition-colors hover:bg-surface-muted hover:text-ink"
            aria-label="Retry"
          >
            <RefreshCcw className="h-4 w-4" strokeWidth={2.25} />
          </button>
        ) : null}
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] text-ink-2 transition-colors hover:bg-surface-muted hover:text-ink"
          aria-label="Remove"
        >
          <X className="h-4 w-4" strokeWidth={2.25} />
        </button>
      </div>
    </li>
  );
}

function TaskStatusPill({ status }: { status: UploadStatus }) {
  if (status === 'ready' || status === 'analyzing') {
    return (
      <span className="inline-flex items-center gap-1 font-medium text-brand-green">
        <Check className="h-3 w-3" strokeWidth={2.25} />
        Uploaded
      </span>
    );
  }
  if (status === 'uploading') {
    return (
      <span className="inline-flex items-center gap-1 font-medium text-brand-blue">
        <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2.25} />
        Uploading
      </span>
    );
  }
  if (status === 'failed') return <span className="text-brand-red">Failed</span>;
  if (status === 'cancelled') return <span>Cancelled</span>;
  return <span>Queued</span>;
}

function DeleteFileModal({
  file,
  onCancel,
  onConfirm,
}: {
  file: SavedFile;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  const name = file.relativePath.split('/').pop() || file.relativePath;
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const ok = typed.trim() === name;
  return (
    <Modal open onOpenChange={(o) => !o && onCancel()}>
      <ModalContent size="sm">
        <ModalHeader>
          <ModalTitle>Delete this file?</ModalTitle>
          <ModalDescription>
            This permanently removes <span className="font-medium text-ink">{name}</span> from the
            asset, including from S3. This can&apos;t be undone. Type the file name to confirm.
          </ModalDescription>
        </ModalHeader>
        <Input
          autoFocus
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={name}
          aria-label="Type the file name to confirm"
        />
        <ModalFooter>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={!ok || busy}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              await onConfirm();
              setBusy(false);
            }}
          >
            Delete file
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

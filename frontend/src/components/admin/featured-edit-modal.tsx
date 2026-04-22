'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ImagePlus, Loader2 } from 'lucide-react';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalFooter,
} from '@/components/ui/modal';
import { Field, Input, Textarea } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { useAuthedFetch } from '@/lib/api/client';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';
import { toast } from '@/components/ui/toaster';
import { ApiError } from '@/lib/api/errors';
import type { AdminAssetRow, AdminFeaturedSlot } from '@/lib/api/admin-types';
import type { LocaleCode } from '@/lib/api/types';

interface Props {
  slot?: AdminFeaturedSlot | null;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}

interface BannerInitiate {
  putUrl: string;
  key: string;
  expiresAt: string;
}

export function FeaturedEditModal({ slot, onOpenChange, onDone }: Props) {
  const fetcher = useAuthedFetch();
  const editing = Boolean(slot);
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<AdminAssetRow | null>(
    slot
      ? ({
          id: slot.assetId,
          slug: slot.assetSlug,
          title: slot.assetTitle,
        } as AdminAssetRow)
      : null,
  );
  const debounced = useDebouncedValue(search, 200);

  const [bannerMode, setBannerMode] = useState<'thumb' | 'custom'>(
    slot?.customBannerKey ? 'custom' : 'thumb',
  );
  const [customBannerKey, setCustomBannerKey] = useState<string | undefined>(
    slot?.customBannerKey ?? undefined,
  );
  const [customBannerUrl, setCustomBannerUrl] = useState<string | undefined>(
    slot?.customBannerUrl ?? undefined,
  );
  const [customTitle, setCustomTitle] = useState(slot?.customTitle ?? '');
  const [shortEn, setShortEn] = useState(slot?.customShortDescription?.en ?? '');
  const [shortId, setShortId] = useState(slot?.customShortDescription?.id ?? '');
  const [isActive, setIsActive] = useState(slot?.isActive ?? true);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const candidateAssets = useQuery({
    queryKey: ['admin', 'featured-asset-search', debounced],
    queryFn: () =>
      fetcher<{ items: AdminAssetRow[] }>('/admin/assets', {
        query: { q: debounced, status: 'PUBLISHED', limit: 8 },
      }),
    enabled: !picked && debounced.length > 1,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!editing) return;
    // Sync if slot prop changes externally
    setPicked(
      slot
        ? ({
            id: slot.assetId,
            slug: slot.assetSlug,
            title: slot.assetTitle,
          } as AdminAssetRow)
        : null,
    );
  }, [editing, slot]);

  const uploadBanner = async (file: File) => {
    setUploading(true);
    try {
      const initiate = await fetcher<BannerInitiate>('/admin/featured/banner-uploads/initiate', {
        method: 'POST',
        body: { contentType: file.type || 'image/png', bytes: file.size },
      });
      await fetch(initiate.putUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'image/png' },
        body: file,
      });
      setCustomBannerKey(initiate.key);
      setCustomBannerUrl(URL.createObjectURL(file));
    } catch (err) {
      toast.error('Banner upload failed', { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setUploading(false);
    }
  };

  const haveBothLanguages = (shortEn || '').trim() && (shortId || '').trim();

  const submit = async () => {
    if (!picked) return;
    if (bannerMode === 'custom' && !customBannerKey) {
      toast.error('Upload a banner image or switch to "Use asset thumbnail".');
      return;
    }
    if (bannerMode === 'custom' && !haveBothLanguages) {
      toast.error('Add custom short descriptions in BOTH languages before saving.');
      return;
    }
    setBusy(true);
    try {
      const customShortDescription: Record<LocaleCode, string> | undefined =
        bannerMode === 'custom' ? { en: shortEn, id: shortId } : undefined;
      const payload = {
        assetId: picked.id,
        isActive,
        customBannerKey: bannerMode === 'custom' ? customBannerKey : undefined,
        customTitle: customTitle || undefined,
        customShortDescription,
      };
      if (editing && slot) {
        await fetcher(`/admin/featured/${slot.id}`, { method: 'PATCH', body: payload });
      } else {
        await fetcher('/admin/featured', { method: 'POST', body: payload });
      }
      toast.success(editing ? 'Slot updated' : 'Slot added');
      onDone();
    } catch (err) {
      if (ApiError.isApiError(err) && err.status === 409) {
        toast.error('Maximum 5 active featured slots. Deactivate one before adding another.');
      } else {
        toast.error(err instanceof Error ? err.message : 'Could not save');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onOpenChange={onOpenChange}>
      <ModalContent size="lg">
        <ModalHeader>
          <ModalTitle>{editing ? 'Edit featured slot' : 'Feature an asset'}</ModalTitle>
          <ModalDescription>
            Featured slots rotate on Discover. Only PUBLISHED assets can be featured.
          </ModalDescription>
        </ModalHeader>

        <Field label="Asset" required>
          {picked ? (
            <div className="flex items-center justify-between p-3 rounded-[12px] border border-line bg-surface-muted/50">
              <div className="min-w-0">
                <p className="text-[14px] font-semibold text-ink truncate">{picked.title}</p>
                <p className="text-caption text-ink-3 font-mono truncate">{picked.slug}</p>
              </div>
              {!editing ? (
                <Button variant="ghost" size="sm" onClick={() => setPicked(null)}>
                  Change
                </Button>
              ) : null}
            </div>
          ) : (
            <>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search a published asset by title or slug"
              />
              {candidateAssets.data?.items && candidateAssets.data.items.length > 0 ? (
                <ul className="mt-2 max-h-[180px] overflow-y-auto rounded-[12px] border border-line bg-surface">
                  {candidateAssets.data.items.map((a) => (
                    <li key={a.id}>
                      <button
                        type="button"
                        onClick={() => setPicked(a)}
                        className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-surface-muted/60 transition-colors"
                      >
                        {a.thumbnailUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={a.thumbnailUrl} alt="" className="h-9 w-14 object-cover rounded-[6px]" />
                        ) : (
                          <span className="h-9 w-14 rounded-[6px] bg-surface-muted" />
                        )}
                        <span>
                          <span className="block text-[14px] font-medium text-ink truncate">{a.title}</span>
                          <span className="block text-caption text-ink-3 font-mono">{a.slug}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          )}
        </Field>

        <Field label="Banner">
          <div className="flex flex-col gap-2">
            <label className="inline-flex items-center gap-2 text-[13.5px] text-ink cursor-pointer">
              <input
                type="radio"
                checked={bannerMode === 'thumb'}
                onChange={() => setBannerMode('thumb')}
                className="h-4 w-4 accent-ink"
              />
              Use asset thumbnail
            </label>
            <label className="inline-flex items-center gap-2 text-[13.5px] text-ink cursor-pointer">
              <input
                type="radio"
                checked={bannerMode === 'custom'}
                onChange={() => setBannerMode('custom')}
                className="h-4 w-4 accent-ink"
              />
              Upload custom banner
            </label>
            {bannerMode === 'custom' ? (
              <div className="mt-1 rounded-[14px] border border-dashed border-line bg-surface-muted/40 p-4">
                <div className="flex items-center gap-3">
                  {customBannerUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={customBannerUrl}
                      alt=""
                      className="h-20 w-36 object-cover rounded-[8px] border border-line"
                    />
                  ) : (
                    <div className="h-20 w-36 rounded-[8px] bg-surface flex items-center justify-center text-ink-3">
                      <ImagePlus className="h-5 w-5" strokeWidth={2.25} />
                    </div>
                  )}
                  <Button
                    variant="secondary"
                    onClick={() => fileRef.current?.click()}
                    loading={uploading}
                    leadingIcon={
                      uploading ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.25} /> : undefined
                    }
                  >
                    {customBannerKey ? 'Replace banner' : 'Upload banner'}
                  </Button>
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  hidden
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => {
                    const f = e.currentTarget.files?.[0];
                    e.currentTarget.value = '';
                    if (f) void uploadBanner(f);
                  }}
                />
              </div>
            ) : null}
          </div>
        </Field>

        <Field id="custom-title" label="Custom title (optional)">
          <Input
            id="custom-title"
            value={customTitle}
            onChange={(e) => setCustomTitle(e.target.value)}
            placeholder={picked?.title}
          />
        </Field>

        {bannerMode === 'custom' ? (
          <div className="grid sm:grid-cols-2 gap-3">
            <Field id="short-en" label="Short description (EN)">
              <Textarea id="short-en" rows={2} value={shortEn} onChange={(e) => setShortEn(e.target.value)} />
            </Field>
            <Field id="short-id" label="Short description (ID)">
              <Textarea id="short-id" rows={2} value={shortId} onChange={(e) => setShortId(e.target.value)} />
            </Field>
          </div>
        ) : null}

        {bannerMode === 'custom' && !haveBothLanguages ? (
          <Alert variant="warning" className="mt-1">
            Provide a short description in both languages.
          </Alert>
        ) : null}

        <label className="inline-flex items-center gap-2 text-[13.5px] text-ink mt-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="h-4 w-4 accent-ink"
          />
          Active
        </label>

        <ModalFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!picked} loading={busy} onClick={submit}>
            {editing ? 'Save' : 'Add'}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

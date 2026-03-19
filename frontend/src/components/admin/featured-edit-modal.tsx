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

'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/components/ui/toaster';
import { useAuthedFetch } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/queries';
import { logEvent } from '@/lib/logger.events';
import { useTranslations } from 'next-intl';

interface SaveToggleArgs {
  assetId: string;
  nextSaved: boolean;
}

/**
 * Optimistic save / unsave. Used by AssetCard's heart button and the
 * asset detail right-rail Save pill. Rolls back on error.
 */
export function useSaveToggle() {
  const fetcher = useAuthedFetch();
  const queryClient = useQueryClient();
  const t = useTranslations('asset');

  return useMutation({
    mutationFn: async ({ assetId, nextSaved }: SaveToggleArgs) => {
      if (nextSaved) {
        await fetcher(`/library/items`, {
          method: 'POST',
          body: { assetId },
        });
      } else {
        await fetcher(`/library/items/${assetId}`, { method: 'DELETE' });
      }
      return { assetId, nextSaved };
    },
    onMutate: async ({ assetId, nextSaved }) => {
      logEvent('asset.save_toggle', { assetId, nextSaved });
      // Optimistically flip isSaved on any cached asset detail and library page.

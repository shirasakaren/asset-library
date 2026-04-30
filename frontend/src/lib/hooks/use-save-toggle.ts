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
      const previousDetails = new Map<string, unknown>();
      queryClient
        .getQueriesData<{ id: string; isSaved: boolean }>({ queryKey: ['asset'] })
        .forEach(([key, data]) => {
          if (data && data.id === assetId) {
            previousDetails.set(JSON.stringify(key), data);
            queryClient.setQueryData(key, { ...data, isSaved: nextSaved });
          }
        });
      return { previousDetails };
    },
    onError: (_err, { assetId, nextSaved }, ctx) => {
      // Roll back optimistic changes.
      ctx?.previousDetails.forEach((data, keyStr) => {
        queryClient.setQueryData(JSON.parse(keyStr), data);
      });
      toast.error(nextSaved ? t('saveFailed') : t('unsaveFailed'), {
        description: `Asset ${assetId}`,
      });
    },
    onSuccess: ({ nextSaved }) => {
      toast.success(nextSaved ? t('savedToast') : t('unsavedToast'));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.libraryAll });
    },
  });
}

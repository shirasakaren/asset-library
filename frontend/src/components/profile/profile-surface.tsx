'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Cpu, RotateCcw } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalFooter,
} from '@/components/ui/modal';
import { useTranslations } from 'next-intl';
import { useAuthedFetch } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/queries';
import { toast } from '@/components/ui/toaster';
import { formatDate, formatRelative } from '@/lib/format';
import { ResetDemoDialog } from '@/components/preview/reset-demo-dialog';
import type { LocaleCode } from '@/lib/api/types';

export interface PluginDevice {
  id: string;
  deviceLabel: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string;
}

interface Props {
  devices: PluginDevice[];
  locale: LocaleCode;
}

export function ProfileSurface({ devices: initial, locale }: Props) {
  const t = useTranslations('profile');
  const fetcher = useAuthedFetch();
  const queryClient = useQueryClient();
  const tv = useTranslations('preview');
  const [confirmRevoke, setConfirmRevoke] = useState<PluginDevice | null>(null);
  const [resetOpen, setResetOpen] = useState(false);

  const list = useQuery({
    queryKey: queryKeys.myDevices,
    queryFn: () => fetcher<PluginDevice[]>('/auth/plugin/devices'),
    initialData: initial,
    staleTime: 30_000,
  });

  const revoke = useMutation({
    mutationFn: async (id: string) => fetcher(`/me/devices/${id}/revoke`, { method: 'POST' }),
    onSuccess: () => toast.success('Device revoked'),
    onError: (err) =>
      toast.error('Revoke failed', {
        description: err instanceof Error ? err.message : String(err),
      }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.myDevices }),
  });

  return (
    <>
      <Card padding="lg" className="mt-6">
        <h2 className="font-display text-h2 tracking-[-0.01em] text-ink">
          Engines connected to your account
        </h2>
        <p className="mt-1 max-w-prose text-body-sm text-ink-3">
          These are the Unity / Unreal editors you’ve signed in from. Revoke any you no longer use.
        </p>
        <ul className="mt-5 divide-y divide-line overflow-hidden rounded-[12px] border border-line">
          {(list.data ?? []).length === 0 ? (
            <li className="px-4 py-8 text-center text-body-sm text-ink-3">
              No plugin devices yet.
            </li>
          ) : (
            (list.data ?? []).map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-4 py-3">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] bg-surface-muted text-ink-2">
                  <Cpu className="h-4 w-4" strokeWidth={2.25} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium text-ink">{d.deviceLabel}</p>
                  <p className="geist-tnum truncate text-caption text-ink-3">
                    Created {formatDate(d.createdAt, locale)} ·{' '}
                    {d.lastUsedAt
                      ? `Last used ${formatRelative(d.lastUsedAt, locale)}`
                      : 'Never used'}{' '}
                    · Expires {formatDate(d.expiresAt, locale)}
                  </p>
                </div>
                <Badge variant={new Date(d.expiresAt) < new Date() ? 'danger' : 'neutral'}>
                  {new Date(d.expiresAt) < new Date() ? 'Expired' : 'Active'}
                </Badge>
                <Button size="sm" variant="ghost" onClick={() => setConfirmRevoke(d)}>
                  Revoke
                </Button>
              </li>
            ))
          )}
        </ul>
      </Card>

      <Card padding="lg" className="mt-6">
        <h2 className="font-display text-h2 tracking-[-0.01em] text-ink">Account</h2>
        <p className="mt-1 text-body-sm text-ink-3">{t('accountBody')}</p>
        <Button
          variant="ghost"
          className="mt-4"
          onClick={() => setResetOpen(true)}
          leadingIcon={<RotateCcw className="h-4 w-4" strokeWidth={2.25} />}
        >
          {tv('resetDemo')}
        </Button>
        <ResetDemoDialog open={resetOpen} onOpenChange={setResetOpen} />
      </Card>

      {confirmRevoke ? (
        <Modal open onOpenChange={(o) => !o && setConfirmRevoke(null)}>
          <ModalContent size="sm">
            <ModalHeader>
              <ModalTitle>Revoke {confirmRevoke.deviceLabel}?</ModalTitle>
              <ModalDescription>
                The plugin will sign out immediately. You can re-authenticate it from inside Unity
                or Unreal later.
              </ModalDescription>
            </ModalHeader>
            <ModalFooter>
              <Button variant="ghost" onClick={() => setConfirmRevoke(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  revoke.mutate(confirmRevoke.id);
                  setConfirmRevoke(null);
                }}
              >
                Revoke
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>
      ) : null}
    </>
  );
}

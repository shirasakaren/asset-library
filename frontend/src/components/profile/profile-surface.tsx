'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { signOut } from 'next-auth/react';
import { Cpu, LogOut } from 'lucide-react';
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
import { useAuthedFetch } from '@/lib/api/client';
import { toast } from '@/components/ui/toaster';
import { formatDate, formatRelative } from '@/lib/format';
import { broadcast } from '@/lib/ws/broadcast';
import type { LocaleCode } from '@/lib/api/types';

interface PluginDevice {
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
  const fetcher = useAuthedFetch();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [confirmRevoke, setConfirmRevoke] = useState<PluginDevice | null>(null);

  const list = useQuery({
    queryKey: ['me', 'devices'],
    queryFn: () => fetcher<PluginDevice[]>('/auth/plugin/devices'),
    initialData: initial,
    staleTime: 30_000,
  });

  const revoke = useMutation({
    mutationFn: async (id: string) =>
      fetcher(`/me/devices/${id}/revoke`, { method: 'POST' }),
    onSuccess: () => toast.success('Device revoked'),
    onError: (err) =>
      toast.error('Revoke failed', { description: err instanceof Error ? err.message : String(err) }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['me', 'devices'] }),
  });

  const handleSignOut = async () => {
    broadcast({ type: 'auth:sign-out' });
    await signOut({ callbackUrl: '/about' });
    router.refresh();
  };

  return (
    <>
      <Card padding="lg" className="mt-6">
        <h2 className="font-display text-h2 text-ink tracking-[-0.01em]">
          Engines connected to your account
        </h2>
        <p className="mt-1 text-body-sm text-ink-3 max-w-prose">
          These are the Unity / Unreal editors you’ve signed in from. Revoke any you no longer use.
        </p>
        <ul className="mt-5 divide-y divide-line border border-line rounded-[12px] overflow-hidden">
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
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-medium text-ink truncate">{d.deviceLabel}</p>
                  <p className="text-caption text-ink-3 geist-tnum truncate">
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
        <h2 className="font-display text-h2 text-ink tracking-[-0.01em]">Account</h2>
        <p className="mt-1 text-body-sm text-ink-3">
          Signing out also revokes the active Keycloak session.
        </p>
        <Button
          variant="ghost"
          className="mt-4 !text-brand-red hover:!bg-brand-red-50"
          onClick={handleSignOut}
          leadingIcon={<LogOut className="h-4 w-4" strokeWidth={2.25} />}
        >
          Sign out
        </Button>
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

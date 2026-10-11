'use client';

import { Alert } from '@/components/ui/alert';
import { Container } from '@/components/layout/container';
import { OwnedAssetGate } from '@/components/publish/owned-asset-gate';
import { PublishWizard } from '@/components/publish/wizard';
import { useMe } from '@/preview/session/me-provider';

/**
 * Body of `/admin/assets/[id]/edit` (the admin layout / `withAdminChrome` supplies the chrome).
 * Reuses the publish gate: same asset query (drafts included) and the same 404 / retry views.
 */
export function AdminAssetEditPageClient({ id }: { id: string }) {
  const me = useMe();
  return (
    <OwnedAssetGate id={id}>
      {(asset) => (
        <Container size="2xl" className="!px-0">
          <Alert
            variant="warning"
            className="mx-6 mt-2"
            title={`Editing on behalf of ${asset.owner.displayName}`}
          >
            You're signed in as {me.displayName}. Every save is audit-logged.
          </Alert>
          <PublishWizard initialAsset={asset} />
        </Container>
      )}
    </OwnedAssetGate>
  );
}

'use client';

import { OwnedAssetGate } from '@/components/publish/owned-asset-gate';
import { PublishWizard } from '@/components/publish/wizard';

/** Body of `/publish/[id]`. Rendered by the page route for seeded ids and by the `not-found` shell otherwise. */
export function PublishWizardPageClient({ id }: { id: string }) {
  return (
    <OwnedAssetGate id={id}>{(asset) => <PublishWizard initialAsset={asset} />}</OwnedAssetGate>
  );
}

'use client';

import { NewVersionForm } from '@/components/publish/new-version-form';
import { OwnedAssetGate } from '@/components/publish/owned-asset-gate';

/** Body of `/publish/[id]/versions/new`. */
export function NewVersionPageClient({ id }: { id: string }) {
  return <OwnedAssetGate id={id}>{(asset) => <NewVersionForm asset={asset} />}</OwnedAssetGate>;
}

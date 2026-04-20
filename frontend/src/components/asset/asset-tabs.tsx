'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { TipTapRenderer } from '@/components/rich-text/tiptap-renderer';
import { PackageTree } from './package-tree';
import { CompatibilityTable } from './compatibility-table';
import { VersionsList } from './versions-list';
import type { AssetDetail, AssetVersionPayload } from '@/lib/api/types';
import { Alert } from '@/components/ui/alert';

interface AssetTabsProps {
  asset: AssetDetail;
  activeVersion: AssetVersionPayload;
  onDownloadVersion: (versionId: string) => void;
}

const VALID = ['description', 'package', 'compatibility', 'versions'] as const;
type TabKey = (typeof VALID)[number];

export function AssetTabs({ asset, activeVersion, onDownloadVersion }: AssetTabsProps) {
  const t = useTranslations('asset.tabs');
  const router = useRouter();
  const [value, setValue] = useState<TabKey>('description');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash.replace('#', '');
    if (VALID.includes(hash as TabKey)) {
      setValue(hash as TabKey);
      // Bring tab strip into view smoothly.
      requestAnimationFrame(() => {
        const el = document.getElementById('asset-tabs');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  }, []);

  const handleChange = (next: string) => {
    setValue(next as TabKey);
    const url = `${window.location.pathname}${window.location.search}#${next}`;
    router.replace(url, { scroll: false });
  };

  return (
    <div id="asset-tabs" className="scroll-mt-24">
      <Tabs value={value} onValueChange={handleChange}>
        <TabsList className="overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <TabsTrigger value="description">{t('description')}</TabsTrigger>
          <TabsTrigger value="package">{t('package')}</TabsTrigger>
          <TabsTrigger value="compatibility">{t('compatibility')}</TabsTrigger>
          <TabsTrigger value="versions">{t('versions')}</TabsTrigger>
        </TabsList>
        <TabsContent value="description" className="pt-6">
          {asset.longDescription ? (
            <TipTapRenderer doc={asset.longDescription} variant="full" />
          ) : (
            <Alert variant="neutral">No long description provided.</Alert>
          )}
        </TabsContent>
        <TabsContent value="package" className="pt-6">
          <PackageTree files={activeVersion.files} />
        </TabsContent>
        <TabsContent value="compatibility" className="pt-6">
          <CompatibilityTable
            rows={activeVersion.compatibility}
            requiresEmptyProject={activeVersion.requiresEmptyProject}
          />
        </TabsContent>
        <TabsContent value="versions" className="pt-6">
          <VersionsList versions={asset.versions} onDownload={onDownloadVersion} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

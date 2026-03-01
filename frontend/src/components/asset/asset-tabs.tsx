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

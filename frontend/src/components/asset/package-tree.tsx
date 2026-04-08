'use client';

import { useMemo, useState } from 'react';
import {
  ChevronRight,
  Folder,
  FolderOpen,
  FileBox,
  Image as ImageIcon,
  Music,
  Video,
  FileCode,
  FileText,
  Package,
  Archive,
} from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import { Input } from '@/components/ui/input';
import { formatBytes } from '@/lib/format';
import type { AssetFile, LocaleCode } from '@/lib/api/types';
import { cn } from '@/lib/utils';

interface PackageTreeProps {
  files: AssetFile[];
}

interface TreeNode {
  name: string;
  path: string;
  kind: 'folder' | 'file';
  fileKind?: string;
  bytes?: bigint;
  meta?: Record<string, unknown> | null;
  children?: Map<string, TreeNode>;
}

function buildTree(files: AssetFile[]): TreeNode {
  const root: TreeNode = { name: '', path: '', kind: 'folder', children: new Map() };
  for (const file of files) {
    const parts = file.relativePath.split('/').filter(Boolean);
    let node = root;
    parts.forEach((part, idx) => {
      const isLast = idx === parts.length - 1;
      let next = node.children!.get(part);
      if (!next) {
        next = {
          name: part,
          path: `${node.path ? `${node.path}/` : ''}${part}`,
          kind: isLast ? 'file' : 'folder',
          children: isLast ? undefined : new Map(),
          ...(isLast
            ? {
                fileKind: file.kind,
                bytes: BigInt(file.bytes),
                meta: file.meta ?? null,
              }
            : {}),
        };
        node.children!.set(part, next);
      }
      node = next;
    });
  }
  return root;
}

function kindIcon(fileKind?: string) {
  if (!fileKind) return FileText;
  const k = fileKind.toUpperCase();
  if (k.includes('UNITY') || k.includes('UPLUGIN')) return Package;
  if (k.includes('GLB') || k.includes('FBX') || k.includes('OBJ') || k === 'PREFAB' || k === 'SCENE') return FileBox;
  if (k.includes('TEXTURE') || k === 'SPRITE' || k.includes('IMAGE') || k.includes('NORMAL')) return ImageIcon;
  if (k.includes('AUDIO')) return Music;
  if (k.includes('VIDEO')) return Video;
  if (k.includes('SCRIPT') || k.includes('SHADER') || k.includes('MATERIAL')) return FileCode;
  if (k.includes('ARCHIVE')) return Archive;
  return FileText;
}

export function PackageTree({ files }: PackageTreeProps) {
  const t = useTranslations('asset.package');
  const locale = useLocale() as LocaleCode;
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    if (!query.trim()) return files;
    const lower = query.toLowerCase();
    return files.filter((f) => f.relativePath.toLowerCase().includes(lower));
  }, [files, query]);

  const tree = useMemo(() => buildTree(filtered), [filtered]);
  const totalBytes = useMemo(
    () => files.reduce((acc, f) => acc + BigInt(f.bytes), 0n),
    [files],
  );

  if (files.length === 0) {
    return <p className="text-body-sm text-ink-3">{t('emptyTree')}</p>;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <p className="text-caption text-ink-3 geist-tnum">
          {t('summary', { count: files.length, size: formatBytes(totalBytes.toString(), locale) })}
        </p>
        <Input
          inputSize="sm"
          type="search"
          placeholder={t('searchPlaceholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-[280px]"
        />
      </div>
      {filtered.length === 0 ? (
        <p className="text-body-sm text-ink-3">{t('emptyMatch', { query })}</p>
      ) : (
        <div className="rounded-[14px] border border-line bg-surface overflow-hidden">
          <ul role="tree" className="text-[13.5px]">
            {Array.from(tree.children?.values() ?? []).map((node) => (
              <TreeRow key={node.path} node={node} depth={0} defaultOpen={!!query} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

interface TreeRowProps {
  node: TreeNode;

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
  depth: number;
  defaultOpen?: boolean;
}

function TreeRow({ node, depth, defaultOpen }: TreeRowProps) {
  const [open, setOpen] = useState(defaultOpen ?? depth < 1);
  const locale = useLocale() as LocaleCode;

  if (node.kind === 'folder') {
    const FolderIcon = open ? FolderOpen : Folder;
    return (
      <li role="treeitem" aria-expanded={open}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center gap-2 px-3 h-9 text-left hover:bg-surface-muted/60 transition-colors duration-120"
          style={{ paddingLeft: 12 + depth * 16 }}
        >
          <ChevronRight
            className={cn('h-3.5 w-3.5 text-ink-3 transition-transform duration-200', open && 'rotate-90')}
            strokeWidth={2.25}
          />
          <FolderIcon className="h-4 w-4 text-ink-2 shrink-0" strokeWidth={2.25} />
          <span className="font-medium text-ink truncate">{node.name}</span>
          <span className="ml-auto text-caption text-ink-3 geist-tnum">
            {node.children ? `${node.children.size} item${node.children.size === 1 ? '' : 's'}` : ''}
          </span>
        </button>
        {open && node.children ? (
          <ul role="group" className="border-t border-line/50">
            {Array.from(node.children.values()).map((child) => (
              <TreeRow key={child.path} node={child} depth={depth + 1} defaultOpen={defaultOpen} />
            ))}
          </ul>
        ) : null}
      </li>
    );
  }

  const FileIcon = kindIcon(node.fileKind);
  const meta = node.meta ?? {};
  const polyCount = typeof meta.triangles === 'number' ? (meta.triangles as number) : null;
  const animLength = typeof meta.duration === 'number' ? (meta.duration as number) : null;

  const tooltip = [
    formatBytes((node.bytes ?? 0n).toString(), locale),
    polyCount ? `${polyCount.toLocaleString()} tris` : null,
    animLength ? `${animLength.toFixed(1)}s` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <li role="treeitem" className="border-t border-line/50">
      <div
        className="flex items-center gap-2 px-3 h-9"
        style={{ paddingLeft: 12 + depth * 16 + 18 }}
        title={tooltip}
      >
        <FileIcon className="h-4 w-4 text-ink-3 shrink-0" strokeWidth={2.25} />
        <span className="text-ink truncate">{node.name}</span>
        <span className="ml-auto text-caption text-ink-3 geist-tnum">
          {formatBytes((node.bytes ?? 0n).toString(), locale)}
        </span>
      </div>
    </li>
  );
}

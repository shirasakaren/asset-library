import { AssetFile } from '@prisma/client';

export interface ManifestNode {
  name: string;
  kind: 'dir' | 'file';
  size?: number;
  fileId?: string;
  fileKind?: string;
  children?: ManifestNode[];
}

/**
 * Builds the hierarchical file tree the frontend renders in the
 * "Package content" tab. Sorts directories before files, alphabetically.
 */
export function buildManifest(files: AssetFile[]): ManifestNode {
  const root: ManifestNode = { name: '', kind: 'dir', children: [] };
  for (const file of files) {
    insertFile(root, file.relativePath.split('/'), file);
  }
  sortRecursive(root);
  return root;
}

function insertFile(node: ManifestNode, segments: string[], file: AssetFile): void {
  const [head, ...rest] = segments;
  if (!node.children) node.children = [];
  if (rest.length === 0) {
    node.children.push({
      name: head,
      kind: 'file',
      size: Number(file.bytes),
      fileId: file.id,
      fileKind: file.kind,
    });
    return;
  }
  let dir = node.children.find((c) => c.kind === 'dir' && c.name === head);
  if (!dir) {
    dir = { name: head, kind: 'dir', children: [] };
    node.children.push(dir);
  }
  insertFile(dir, rest, file);
}

function sortRecursive(node: ManifestNode): void {
  if (!node.children) return;
  node.children.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  for (const c of node.children) if (c.kind === 'dir') sortRecursive(c);
}

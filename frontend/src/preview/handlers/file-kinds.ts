import type { FileKind } from '@/lib/api/types';

/**
 * Extension -> `FileKind` (the UI's union in `lib/api/types.ts`, which is what the Search
 * `fileKinds` filter and the file icons use). The real analyzer has its own, different enum
 * (`kind-detector.ts`); this keeps its extension table but maps onto the UI kinds
 * (`gltf` is a `GLB`, every script is a `SCRIPT`, `blend` / `anim` / documents are `OTHER`).
 */
const EXT_TO_KIND: Record<string, FileKind> = {
  unitypackage: 'UNITYPACKAGE',
  uplugin: 'UPLUGIN',
  uproject: 'UNREAL_PROJECT',
  glb: 'GLB',
  gltf: 'GLB',
  fbx: 'FBX',
  obj: 'OBJ',
  png: 'TEXTURE_2D',
  jpg: 'TEXTURE_2D',
  jpeg: 'TEXTURE_2D',
  tga: 'TEXTURE_2D',
  exr: 'TEXTURE_2D',
  psd: 'TEXTURE_2D',
  tif: 'TEXTURE_2D',
  tiff: 'TEXTURE_2D',
  webp: 'TEXTURE_2D',
  dds: 'TEXTURE_2D',
  mat: 'MATERIAL',
  shader: 'SHADER',
  shadergraph: 'SHADER',
  usf: 'SHADER',
  hlsl: 'SHADER',
  glsl: 'SHADER',
  wav: 'AUDIO',
  mp3: 'AUDIO',
  ogg: 'AUDIO',
  flac: 'AUDIO',
  aac: 'AUDIO',
  mp4: 'VIDEO',
  mov: 'VIDEO',
  webm: 'VIDEO',
  mkv: 'VIDEO',
  cs: 'SCRIPT',
  cpp: 'SCRIPT',
  cc: 'SCRIPT',
  h: 'SCRIPT',
  hpp: 'SCRIPT',
  py: 'SCRIPT',
  prefab: 'PREFAB',
  unity: 'SCENE',
  umap: 'SCENE',
  zip: 'ARCHIVE',
  '7z': 'ARCHIVE',
  rar: 'ARCHIVE',
  tar: 'ARCHIVE',
  gz: 'ARCHIVE',
  tgz: 'ARCHIVE',
};

const IMAGE_EXTS = new Set([
  'png',
  'jpg',
  'jpeg',
  'tga',
  'exr',
  'psd',
  'tif',
  'tiff',
  'webp',
  'dds',
]);
// `brick_normal.png`, `brick-nrm.tga`, `Normal.png`: the word must stand alone, so `abnormal.png` stays a texture.
const NORMAL_MAP_NAME = /(^|[^a-z0-9])(normal|normals|nrm|nor)([^a-z0-9]|$)/i;

/** Kind of an uploaded file from its name; anything unknown is `OTHER`. */
export function detectFileKind(relativePath: string): FileKind | string {
  const name = relativePath.slice(relativePath.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  // No extension, or a dotfile such as `.hidden`.
  if (dot <= 0) return 'OTHER';
  const ext = name.slice(dot + 1).toLowerCase();
  if (IMAGE_EXTS.has(ext) && NORMAL_MAP_NAME.test(name.slice(0, dot))) return 'NORMAL_MAP';
  return EXT_TO_KIND[ext] ?? 'OTHER';
}

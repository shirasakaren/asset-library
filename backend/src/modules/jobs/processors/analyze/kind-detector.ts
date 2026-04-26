import { AssetFileKind } from '@prisma/client';

/**
 * Maps a file's extension (and, where useful, the MIME hint we already have
 * from upload-complete) to the AssetFileKind enum. Magic-byte sniffing for
 * the trickier formats lives in the per-format extractors — here we only
 * need a fast initial classification.
 */
const EXT_TO_KIND: Record<string, AssetFileKind> = {
  unitypackage: AssetFileKind.UNITYPACKAGE,
  uplugin: AssetFileKind.UPLUGIN,
  uproject: AssetFileKind.UPROJECT,
  fbx: AssetFileKind.FBX,
  obj: AssetFileKind.OBJ,
  glb: AssetFileKind.GLB,
  gltf: AssetFileKind.GLTF,
  blend: AssetFileKind.BLEND,
  ma: AssetFileKind.MAYA,
  mb: AssetFileKind.MAYA,
  png: AssetFileKind.TEXTURE_2D,
  jpg: AssetFileKind.TEXTURE_2D,
  jpeg: AssetFileKind.TEXTURE_2D,
  tga: AssetFileKind.TEXTURE_2D,
  exr: AssetFileKind.TEXTURE_2D,
  psd: AssetFileKind.TEXTURE_2D,
  tif: AssetFileKind.TEXTURE_2D,
  tiff: AssetFileKind.TEXTURE_2D,
  webp: AssetFileKind.TEXTURE_2D,
  wav: AssetFileKind.AUDIO,
  mp3: AssetFileKind.AUDIO,
  ogg: AssetFileKind.AUDIO,
  flac: AssetFileKind.AUDIO,
  aac: AssetFileKind.AUDIO,
  mp4: AssetFileKind.VIDEO,
  mov: AssetFileKind.VIDEO,
  webm: AssetFileKind.VIDEO,
  mkv: AssetFileKind.VIDEO,
  anim: AssetFileKind.ANIMATION,
  controller: AssetFileKind.ANIMATION,
  shader: AssetFileKind.SHADER,
  shadergraph: AssetFileKind.SHADER,
  usf: AssetFileKind.SHADER,

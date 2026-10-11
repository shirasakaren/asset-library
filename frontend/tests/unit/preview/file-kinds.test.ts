import { describe, expect, it } from 'vitest';
import { detectFileKind } from '@/preview/handlers/file-kinds';

describe('detectFileKind', () => {
  it.each([
    ['pack.unitypackage', 'UNITYPACKAGE'],
    ['Plugin/My.uplugin', 'UPLUGIN'],
    ['Game.uproject', 'UNREAL_PROJECT'],
    ['model.glb', 'GLB'],
    ['model.gltf', 'GLB'],
    ['model.fbx', 'FBX'],
    ['model.obj', 'OBJ'],
    ['tex/albedo.png', 'TEXTURE_2D'],
    ['tex/albedo.JPG', 'TEXTURE_2D'],
    ['tex/hdr.exr', 'TEXTURE_2D'],
    ['wood.mat', 'MATERIAL'],
    ['water.shader', 'SHADER'],
    ['water.shadergraph', 'SHADER'],
    ['sfx/step.wav', 'AUDIO'],
    ['sfx/step.OGG', 'AUDIO'],
    ['clip.mp4', 'VIDEO'],
    ['Player.cs', 'SCRIPT'],
    ['tools/build.py', 'SCRIPT'],
    ['Hero.prefab', 'PREFAB'],
    ['Level1.unity', 'SCENE'],
    ['Level1.umap', 'SCENE'],
    ['bundle.zip', 'ARCHIVE'],
    ['bundle.7z', 'ARCHIVE'],
    ['notes.txt', 'OTHER'],
  ])('%s -> %s', (path, kind) => {
    expect(detectFileKind(path)).toBe(kind);
  });

  it('marks normal-map textures', () => {
    expect(detectFileKind('tex/brick_normal.png')).toBe('NORMAL_MAP');
    expect(detectFileKind('tex/brick_nrm.tga')).toBe('NORMAL_MAP');
    expect(detectFileKind('tex/abnormal.png')).toBe('TEXTURE_2D');
  });

  it('defaults to OTHER for no or unknown extensions', () => {
    expect(detectFileKind('README')).toBe('OTHER');
    expect(detectFileKind('thing.xyz')).toBe('OTHER');
    expect(detectFileKind('')).toBe('OTHER');
    expect(detectFileKind('.hidden')).toBe('OTHER');
    expect(detectFileKind('dir.v2/file')).toBe('OTHER');
  });
});

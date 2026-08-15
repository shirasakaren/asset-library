import { AssetFileKind } from '@prisma/client';
import { detectKindByExtension } from '../../src/modules/jobs/processors/analyze/kind-detector';

describe('kind detector', () => {
  it.each([
    ['Assets/Models/Hero.FBX', AssetFileKind.FBX],
    ['textures/diff.PNG', AssetFileKind.TEXTURE_2D],
    ['sounds/explosion.WAV', AssetFileKind.AUDIO],
    ['video/intro.mp4', AssetFileKind.VIDEO],
    ['Pack.unitypackage', AssetFileKind.UNITYPACKAGE],
    ['MyPlugin.uplugin', AssetFileKind.UPLUGIN],
    ['MyProject.uproject', AssetFileKind.UPROJECT],
    ['scripts/script.cs', AssetFileKind.SCRIPT_CS],
    ['main.cpp', AssetFileKind.SCRIPT_CPP],
    ['tool.py', AssetFileKind.SCRIPT_PY],
    ['shaders/post.usf', AssetFileKind.SHADER],
    ['bundle.7z', AssetFileKind.ARCHIVE],
    ['doc/readme.md', AssetFileKind.DOCUMENT],
    ['Assets/scene.blend', AssetFileKind.BLEND],
    ['Maya/character.mb', AssetFileKind.MAYA],
    ['unknown.thing', AssetFileKind.OTHER],
    ['no-extension', AssetFileKind.OTHER],
  ])('%s → %s', (path, expected) => {
    expect(detectKindByExtension(path)).toBe(expected);
  });
});

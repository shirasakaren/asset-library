import { AssetFile, AssetFileKind } from '@prisma/client';
import { buildManifest, ManifestNode } from '../../src/modules/jobs/processors/analyze/manifest';

function makeFile(path: string, kind: AssetFileKind = AssetFileKind.OTHER, bytes = 0): AssetFile {
  return {
    id: `f-${path}`,
    versionId: 'v1',
    s3Key: `prefix/${path}`,
    relativePath: path,
    bytes: BigInt(bytes),
    mimeType: 'application/octet-stream',
    kind,
    meta: null,
    createdAt: new Date(),
  } as AssetFile;
}

describe('manifest builder', () => {
  it('groups files into a nested tree', () => {
    const tree = buildManifest([
      makeFile('Assets/Models/Hero.fbx', AssetFileKind.FBX, 100),
      makeFile('Assets/Materials/Hero.mat'),
      makeFile('Assets/Models/Sword.fbx', AssetFileKind.FBX, 50),
      makeFile('README.md', AssetFileKind.DOCUMENT, 5),
    ]);
    const assets = (tree.children ?? []).find((c) => c.name === 'Assets')!;
    const models = (assets.children ?? []).find((c) => c.name === 'Models')!;
    expect(models.children?.map((c) => c.name)).toEqual(['Hero.fbx', 'Sword.fbx']);
  });

  it('sorts directories before files at each level', () => {
    const tree = buildManifest([makeFile('README.md'), makeFile('Assets/Hero.fbx')]);
    const order = (tree.children ?? []).map((c) => c.kind);
    expect(order).toEqual(['dir', 'file']);
  });

  it('preserves file metadata (kind, size, id)', () => {
    const tree = buildManifest([makeFile('Models/Hero.fbx', AssetFileKind.FBX, 7777)]);
    const fbx = ((tree.children ?? [])[0].children ?? [])[0] as ManifestNode;
    expect(fbx).toMatchObject({
      kind: 'file',
      fileKind: AssetFileKind.FBX,
      size: 7777,
    });
  });
});

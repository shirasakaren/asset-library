import { writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  extractUPlugin,
  extractUProject,
} from '../../src/modules/jobs/processors/analyze/extractors/unreal.extractor';

describe('Unreal extractors', () => {
  let dir: string;
  beforeAll(async () => {
    dir = join(tmpdir(), `mgm-test-${Date.now()}`);
    await mkdir(dir, { recursive: true });
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('reads .uplugin JSON', async () => {
    const path = join(dir, 'a.uplugin');
    await writeFile(
      path,
      JSON.stringify({
        FriendlyName: 'My Plugin',
        VersionName: '1.0.2',
        EngineVersion: '5.4',
        Modules: [{ Name: 'Runtime' }, { Name: 'Editor' }],
        Plugins: [
          { Name: 'OnlineSubsystem', Enabled: true },
          { Name: 'Legacy', Enabled: false },
        ],
      }),
    );
    const meta = await extractUPlugin(path);
    expect(meta).toMatchObject({
      friendlyName: 'My Plugin',
      versionName: '1.0.2',
      modules: ['Runtime', 'Editor'],
      plugins: [
        { name: 'OnlineSubsystem', enabled: true },
        { name: 'Legacy', enabled: false },
      ],
    });
  });

  it('reads .uproject JSON', async () => {
    const path = join(dir, 'a.uproject');
    await writeFile(
      path,
      JSON.stringify({
        EngineAssociation: '5.4',
        Plugins: [{ Name: 'X', Enabled: true }],
        Modules: [{ Name: 'Main' }],
      }),
    );
    const meta = await extractUProject(path);
    expect(meta).toMatchObject({ engineVersion: '5.4', plugins: [{ name: 'X', enabled: true }] });
  });

  it('returns null on malformed JSON', async () => {
    const path = join(dir, 'bad.uplugin');
    await writeFile(path, 'not json at all');
    expect(await extractUPlugin(path)).toBeNull();
  });
});

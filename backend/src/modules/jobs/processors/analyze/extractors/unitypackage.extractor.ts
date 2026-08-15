import { createReadStream } from 'node:fs';
import { createGunzip } from 'node:zlib';
import { extract } from 'tar-stream';

export interface UnityPackageMeta {
  unityVersion?: string;
  contents: string[];
  /** Render-pipeline hints found in the package (URP / HDRP / SRP / BUILT_IN). */
  renderPipelineHints: string[];
  hasProjectSettings: boolean;
  /** UPM `manifest.json` dependencies, if a manifest is included. */
  dependencies: Array<{ name: string; version: string }>;
}

/**
 * A .unitypackage is a tar.gz of one folder per asset, each containing
 * `pathname` + `asset` + `metaData` blobs. We walk the tar entries:
 *   - read every `pathname` (project-relative path of the contained file);
 *   - if we find `ProjectVersion.txt`, capture the Unity editor version;
 *   - if we find `Packages/manifest.json`, parse UPM deps;
 *   - if we find anything under `ProjectSettings/` flip `hasProjectSettings`;
 *   - sniff for URP/HDRP/SRP/BuiltIn asmdefs to fill `renderPipelineHints`.
 */
export async function extractUnityPackage(
  filePath: string,
  maxBytes = 50_000_000,
): Promise<UnityPackageMeta> {
  const meta: UnityPackageMeta = {
    contents: [],
    renderPipelineHints: [],
    hasProjectSettings: false,
    dependencies: [],
  };

  await new Promise<void>((resolve, reject) => {
    const tarExtractor = extract();
    let bytesRead = 0;

    tarExtractor.on('entry', (header, stream, next) => {
      const isPathname = header.name.endsWith('/pathname');
      const isManifest = header.name.endsWith('Packages/manifest.json');
      const isProjectVersion = header.name.endsWith('ProjectVersion.txt');
      if (!isPathname && !isManifest && !isProjectVersion) {
        stream.resume();
        stream.on('end', next);
        return;
      }
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => {
        bytesRead += chunk.length;
        if (bytesRead > maxBytes) {
          stream.destroy();
          return;
        }
        chunks.push(chunk);
      });
      stream.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        if (isPathname) {
          const trimmed = text.trim();
          if (trimmed) {
            meta.contents.push(trimmed);
            if (trimmed.startsWith('ProjectSettings/')) meta.hasProjectSettings = true;
            if (/URP|UniversalRP|Universal Render Pipeline/i.test(trimmed))
              meta.renderPipelineHints.push('URP');
            if (/HDRP|HighDefinition/i.test(trimmed)) meta.renderPipelineHints.push('HDRP');
            if (/Built[-_ ]?in/i.test(trimmed)) meta.renderPipelineHints.push('BUILT_IN');
            if (/Shader Graph|ScriptableRenderPipeline/i.test(trimmed))
              meta.renderPipelineHints.push('SRP');
          }
        } else if (isProjectVersion) {
          const m = text.match(/m_EditorVersion:\s*([\w.]+)/);
          if (m) meta.unityVersion = m[1];
        } else if (isManifest) {
          try {
            const parsed = JSON.parse(text) as { dependencies?: Record<string, string> };
            if (parsed.dependencies) {
              meta.dependencies = Object.entries(parsed.dependencies).map(([name, version]) => ({
                name,
                version,
              }));
            }
          } catch {
            // malformed manifest — ignore
          }
        }
        next();
      });
      stream.on('error', next);
    });

    tarExtractor.on('finish', resolve);
    tarExtractor.on('error', reject);

    createReadStream(filePath).pipe(createGunzip()).pipe(tarExtractor);
  });

  meta.renderPipelineHints = Array.from(new Set(meta.renderPipelineHints));
  return meta;
}

import { readFile } from 'node:fs/promises';

export interface UPluginMeta {
  friendlyName?: string;
  versionName?: string;
  engineVersion?: string;
  modules: string[];
  plugins: Array<{ name: string; enabled: boolean }>;
}

export interface UProjectMeta {
  engineVersion?: string;
  plugins: Array<{ name: string; enabled: boolean }>;
  modules: string[];
}

interface UPluginFile {
  FriendlyName?: string;
  VersionName?: string;
  EngineVersion?: string;
  Modules?: Array<{ Name?: string }>;
  Plugins?: Array<{ Name?: string; Enabled?: boolean }>;
}

interface UProjectFile {
  EngineAssociation?: string;
  Plugins?: Array<{ Name?: string; Enabled?: boolean }>;
  Modules?: Array<{ Name?: string }>;
}

/** Both `.uplugin` and `.uproject` are JSON documents — just parse them. */
export async function extractUPlugin(filePath: string): Promise<UPluginMeta | null> {
  try {
    const raw = await readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as UPluginFile;
    return {
      friendlyName: parsed.FriendlyName,
      versionName: parsed.VersionName,
      engineVersion: parsed.EngineVersion,
      modules: (parsed.Modules ?? []).map((m) => m.Name ?? '').filter(Boolean),
      plugins: (parsed.Plugins ?? [])
        .map((p) => ({ name: p.Name ?? '', enabled: !!p.Enabled }))
        .filter((p) => p.name),
    };
  } catch {
    return null;
  }
}

export async function extractUProject(filePath: string): Promise<UProjectMeta | null> {
  try {
    const raw = await readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as UProjectFile;
    return {
      engineVersion: parsed.EngineAssociation,
      modules: (parsed.Modules ?? []).map((m) => m.Name ?? '').filter(Boolean),
      plugins: (parsed.Plugins ?? [])
        .map((p) => ({ name: p.Name ?? '', enabled: !!p.Enabled }))
        .filter((p) => p.name),
    };
  } catch {
    return null;
  }
}

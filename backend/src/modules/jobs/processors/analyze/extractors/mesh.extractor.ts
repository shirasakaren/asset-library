import { runSubprocess } from '../subprocess';

export interface AnimationClipMeta {
  name: string;
  lengthSec: number;
  hasRootMotion: boolean;
}

export interface MeshMeta {
  triangles: number;
  quads: number;
  vertices: number;
  materials: number;
  hasSkeleton: boolean;
  animations: AnimationClipMeta[];
  boundingBox: { min: [number, number, number]; max: [number, number, number] };
  textureRefs: string[];
}

/** Path to the Python wrapper. Lives in `scripts/python/mesh_probe.py`. */
import { join } from 'node:path';
const MESH_PROBE_SCRIPT = join(process.cwd(), 'scripts', 'python', 'mesh_probe.py');

/**
 * Runs the bundled Python probe (uses pyassimp under the hood) against a 3D
 * file. The script prints a single JSON object on stdout — anything else is
 * treated as a failure.
 */
export async function extractMesh(
  filePath: string,
  opts: { venvBin: string; timeoutMs: number },
): Promise<MeshMeta | null> {
  try {
    const result = await runSubprocess(`${opts.venvBin}/python3`, [MESH_PROBE_SCRIPT, filePath], {
      timeoutMs: opts.timeoutMs,
    });
    if (result.exitCode !== 0) return null;
    return JSON.parse(result.stdout) as MeshMeta;
  } catch {
    return null;
  }
}

/**
 * The `.blend` format is opaque to pyassimp; this calls Blender headless to
 * export a temp glTF + read its stats via the same probe.
 */
export async function extractBlendViaBlender(
  filePath: string,
  opts: { blenderBin: string; timeoutMs: number },
): Promise<MeshMeta | null> {
  // Blender script lives in scripts/blender/blend_probe.py — emits the same
  // JSON shape on stdout as the pyassimp wrapper.
  const script = join(process.cwd(), 'scripts', 'blender', 'blend_probe.py');
  try {
    const result = await runSubprocess(opts.blenderBin, ['-b', '-P', script, '--', filePath], {
      timeoutMs: opts.timeoutMs,
    });
    if (result.exitCode !== 0) return null;
    // Blender prints license headers and its own logs — find the JSON line.
    const jsonLine = result.stdout.split('\n').find((line) => line.trim().startsWith('{'));
    if (!jsonLine) return null;
    return JSON.parse(jsonLine) as MeshMeta;
  } catch {
    return null;
  }
}

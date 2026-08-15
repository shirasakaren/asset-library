import { Injectable } from '@nestjs/common';
import { AssetFileKind } from '@prisma/client';
import { AppConfigService } from '../../../../config/app-config.service';
import { S3Service } from '../../../../infra/s3/s3.service';
import { detectKindByExtension } from './kind-detector';
import { openScratch } from './scratch';
import { extractImage } from './extractors/image.extractor';
import { extractAudio, extractVideo } from './extractors/media.extractor';
import { extractBlendViaBlender, extractMesh } from './extractors/mesh.extractor';
import { extractUPlugin, extractUProject } from './extractors/unreal.extractor';
import { extractUnityPackage } from './extractors/unitypackage.extractor';

export interface AnalyzedFile {
  kind: AssetFileKind;
  bytes: number;
  mimeType: string;
  meta: Record<string, unknown>;
  /** Dependencies discovered while analyzing this file (e.g. UPM manifest). */
  dependencies?: Array<{ name: string; version?: string; source: string }>;
  /** Hint propagated upstream — sets Asset.requiresEmptyProject. */
  requiresEmptyProject?: boolean;
}

/**
 * Single entry point for the per-file analyzer. Picks the right extractor by
 * file kind; returns the unified `AnalyzedFile` shape that the worker can
 * persist with one call.
 *
 * Idempotent: rerunning over the same `(versionId, fileId)` produces the same
 * fields. The worker upserts using the file id as the key.
 */
@Injectable()
export class AnalyzeService {
  constructor(
    private readonly s3: S3Service,
    private readonly config: AppConfigService,
  ) {}

  async analyzeFile(input: {
    jobId: string;
    s3Key: string;
    relativePath: string;
    bytes: number;
    mimeType: string;
  }): Promise<AnalyzedFile> {
    const kind = detectKindByExtension(input.relativePath);
    const timeoutMs = this.config.get('ANALYZE_TIMEOUT_SEC') * 1000;
    const scratch = await openScratch(
      this.s3,
      'assets',
      input.s3Key,
      input.jobId,
      this.config.get('WORKER_SCRATCH_DIR'),
    );
    try {
      return await this.dispatch(kind, scratch.filePath, input, timeoutMs);
    } finally {
      await scratch.cleanup();
    }
  }

  private async dispatch(
    kind: AssetFileKind,
    filePath: string,
    input: { bytes: number; mimeType: string },
    timeoutMs: number,
  ): Promise<AnalyzedFile> {
    const base: AnalyzedFile = {
      kind,
      bytes: input.bytes,
      mimeType: input.mimeType,
      meta: {},
    };
    switch (kind) {
      case AssetFileKind.TEXTURE_2D:
      case AssetFileKind.SPRITE: {
        const img = await extractImage(filePath);
        return { ...base, meta: (img ?? {}) as Record<string, unknown> };
      }
      case AssetFileKind.AUDIO: {
        const audio = await extractAudio(filePath, this.config.get('FFPROBE_BIN'), timeoutMs);
        return { ...base, meta: (audio ?? {}) as Record<string, unknown> };
      }
      case AssetFileKind.VIDEO: {
        const video = await extractVideo(filePath, this.config.get('FFPROBE_BIN'), timeoutMs);
        return { ...base, meta: (video ?? {}) as Record<string, unknown> };
      }
      case AssetFileKind.FBX:
      case AssetFileKind.OBJ:
      case AssetFileKind.GLB:
      case AssetFileKind.GLTF: {
        const mesh = await extractMesh(filePath, {
          venvBin: this.config.get('PYANALYZE_VENV') + '/bin',
          timeoutMs,
        });
        return { ...base, meta: (mesh ?? {}) as Record<string, unknown> };
      }
      case AssetFileKind.BLEND: {
        const mesh = await extractBlendViaBlender(filePath, {
          blenderBin: this.config.get('BLENDER_BIN'),
          timeoutMs,
        });
        return { ...base, meta: (mesh ?? {}) as Record<string, unknown> };
      }
      case AssetFileKind.UNITYPACKAGE: {
        const pkg = await extractUnityPackage(filePath);
        return {
          ...base,
          meta: {
            unityVersion: pkg.unityVersion,
            contents: pkg.contents,
            renderPipelineHints: pkg.renderPipelineHints,
          },
          dependencies: pkg.dependencies.map((d) => ({
            name: d.name,
            version: d.version,
            source: 'UnityPackageManager',
          })),
          requiresEmptyProject: pkg.hasProjectSettings,
        };
      }
      case AssetFileKind.UPLUGIN: {
        const plugin = await extractUPlugin(filePath);
        return {
          ...base,
          meta: (plugin ?? {}) as Record<string, unknown>,
          dependencies:
            plugin?.plugins
              .filter((p) => p.enabled)
              .map((p) => ({ name: p.name, source: 'UnrealPlugin' })) ?? [],
        };
      }
      case AssetFileKind.UPROJECT: {
        const proj = await extractUProject(filePath);
        return {
          ...base,
          meta: (proj ?? {}) as Record<string, unknown>,
          requiresEmptyProject: true,
          dependencies:
            proj?.plugins
              .filter((p) => p.enabled)
              .map((p) => ({ name: p.name, source: 'UnrealPlugin' })) ?? [],
        };
      }
      default:
        return base;
    }
  }
}

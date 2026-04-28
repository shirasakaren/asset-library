import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';

export type GifProvider = 'tenor' | 'giphy';

export interface GifResult {
  id: string;
  /** Animated GIF/MP4 URL suitable for inline rendering. */
  url: string;
  /** Static-ish preview used in the picker grid. */
  preview: string;
  width: number;
  height: number;
  title: string;
}

export interface GifSearchResponse {
  provider: GifProvider | null;
  results: GifResult[];
  /** Providers that are configured (have a key) so the UI can show tabs. */
  available: GifProvider[];
}

/**
 * Thin server-side proxy for GIF search. Keeps the Giphy/Tenor API keys out
 * of the browser. Either provider can be disabled by leaving its key blank.
 */
@Injectable()
export class GifsService {
  private readonly logger = new Logger(GifsService.name);

  constructor(private readonly config: AppConfigService) {}

  available(): GifProvider[] {
    const out: GifProvider[] = [];
    if (this.config.get('TENOR_API_KEY')) out.push('tenor');
    if (this.config.get('GIPHY_API_KEY')) out.push('giphy');
    return out;
  }

  async search(
    query: string,
    provider: GifProvider | undefined,
    limit: number,
  ): Promise<GifSearchResponse> {
    const available = this.available();
    if (available.length === 0) {
      return { provider: null, results: [], available };
    }
    const chosen = provider && available.includes(provider) ? provider : available[0];
    const results =
      chosen === 'tenor'
        ? await this.searchTenor(query, limit)
        : await this.searchGiphy(query, limit);
    return { provider: chosen, results, available };
  }

  private async searchTenor(query: string, limit: number): Promise<GifResult[]> {
    const key = this.config.get('TENOR_API_KEY');
    const url = new URL('https://tenor.googleapis.com/v2/search');
    url.searchParams.set('key', key);
    url.searchParams.set('q', query || 'trending');
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('media_filter', 'gif,tinygif');
    url.searchParams.set('client_key', 'mgm-asset-library');
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`Tenor ${res.status}`);
      const json = (await res.json()) as {
        results?: Array<{
          id: string;
          content_description?: string;
          media_formats?: Record<string, { url: string; dims?: [number, number] }>;
        }>;
      };
      return (json.results ?? []).flatMap((r) => {
        const full = r.media_formats?.gif ?? r.media_formats?.tinygif;
        const preview = r.media_formats?.tinygif ?? full;
        if (!full || !preview) return [];
        return [
          {
            id: r.id,
            url: full.url,
            preview: preview.url,
            width: full.dims?.[0] ?? 0,
            height: full.dims?.[1] ?? 0,
            title: r.content_description ?? '',
          },
        ];
      });
    } catch (err) {
      this.logger.warn(`Tenor search failed: ${(err as Error).message}`);
      return [];
    }
  }

  private async searchGiphy(query: string, limit: number): Promise<GifResult[]> {
    const key = this.config.get('GIPHY_API_KEY');
    const base = query
      ? 'https://api.giphy.com/v1/gifs/search'
      : 'https://api.giphy.com/v1/gifs/trending';
    const url = new URL(base);
    url.searchParams.set('api_key', key);
    if (query) url.searchParams.set('q', query);
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('rating', 'pg-13');
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`Giphy ${res.status}`);
      const json = (await res.json()) as {
        data?: Array<{
          id: string;
          title?: string;
          images?: {
            original?: { url: string; width: string; height: string };
            fixed_width?: { url: string; width: string; height: string };
          };
        }>;
      };
      return (json.data ?? []).flatMap((g) => {
        const full = g.images?.original;
        const preview = g.images?.fixed_width ?? full;
        if (!full || !preview) return [];
        return [
          {
            id: g.id,
            url: full.url,
            preview: preview.url,
            width: Number(full.width) || 0,
            height: Number(full.height) || 0,
            title: g.title ?? '',
          },
        ];
      });
    } catch (err) {
      this.logger.warn(`Giphy search failed: ${(err as Error).message}`);
      return [];
    }
  }
}

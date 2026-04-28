'use client';

import Image from 'next/image';
import { useState } from 'react';
import { cn } from '@/lib/utils';

interface ThumbnailImageProps {
  src?: string | null;
  fallback?: string | null;
  alt: string;
  fill?: boolean;
  width?: number;
  height?: number;
  priority?: boolean;
  className?: string;
  sizes?: string;
  /**
   * Skip the next/image optimizer and render a plain <img>. Use for grid
   * thumbnails: the backend already serves pre-resized thumbs, and presigned
   * S3 URLs carry a fresh query string every load so the optimizer cache never
   * hits — routing them through /_next/image just adds a server round-trip per
   * card. Keep the optimizer (default) for full-res / lightbox imagery.
   */
  unoptimized?: boolean;
}

/**
 * Thumbnail wrapper. Picks `src` first, falls back to `fallback`
 * (auto-generated preview), then to a brand-tinted placeholder.
 * Applies the DS-required 1px inner border + 20px radius and a
 * surface-muted shimmer until the image loads.
 */
export function ThumbnailImage({
  src,
  fallback,
  alt,
  fill = true,
  width,
  height,
  priority = false,
  className,
  sizes = '(min-width: 1280px) 320px, (min-width: 768px) 50vw, 100vw',
  unoptimized = false,
}: ThumbnailImageProps) {
  const url = src || fallback || null;
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-[20px] bg-surface-muted',
        'after:absolute after:inset-0 after:rounded-[20px] after:pointer-events-none after:shadow-[inset_0_0_0_1px_rgba(14,17,22,0.06)]',
        // In fill mode the consumer wraps us in a sized aspect-ratio
        // container; we have to actually fill that container, otherwise
        // the absolutely-positioned <Image fill> inside has nothing to
        // fill and collapses to 0×0 (this was the asset-card / dashboard
        // "blank thumbnail" bug). We use h-full w-full instead of
        // absolute inset-0 so this works whether the parent is positioned
        // or not.
        fill ? 'h-full w-full' : 'inline-block',
        className,
      )}
      style={fill ? undefined : { width, height }}
    >
      {!loaded && !errored ? (
        <div className="absolute inset-0 skeleton" aria-hidden />
      ) : null}
      {url && !errored ? (
        // Plain <img> when:
        //  - blob: / data: URLs (next/image refuses them — local publish-wizard
        //    previews that must render the moment the file is picked), or
        //  - unoptimized grid thumbnails (pre-resized, presigned: the optimizer
        //    adds a server round-trip with ~0% cache hit).
        url.startsWith('blob:') || url.startsWith('data:') || unoptimized ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={alt}
            loading={priority ? 'eager' : 'lazy'}
            decoding="async"
            className={cn(
              'absolute inset-0 h-full w-full object-cover transition-opacity duration-200',
              loaded ? 'opacity-100' : 'opacity-0',
            )}
            onLoad={() => setLoaded(true)}
            onError={() => setErrored(true)}
          />
        ) : (
          <Image
            src={url}
            alt={alt}
            fill={fill}
            width={fill ? undefined : width}
            height={fill ? undefined : height}
            priority={priority}
            sizes={fill ? sizes : undefined}
            className={cn(
              'object-cover transition-opacity duration-200',
              loaded ? 'opacity-100' : 'opacity-0',
            )}
            onLoad={() => setLoaded(true)}
            onError={() => setErrored(true)}
          />
        )
      ) : null}
      {errored || !url ? <ThumbnailPlaceholder alt={alt} /> : null}
    </div>
  );
}

function ThumbnailPlaceholder({ alt }: { alt: string }) {
  // Hash-based brand tint so duplicate empty thumbnails don't all look the same.
  const palette = ['#ecf1fa', '#fef6e0', '#fee5e5', '#e2f1ea'];
  let h = 0;
  for (let i = 0; i < alt.length; i++) h = (h * 31 + alt.charCodeAt(i)) | 0;
  const bg = palette[Math.abs(h) % palette.length]!;
  const initials =
    alt
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join('') || '?';
  return (
    <div
      aria-hidden
      className="absolute inset-0 flex items-center justify-center"
      style={{ background: bg }}
    >
      <span className="font-display text-h1 text-ink/30 tracking-[-0.02em] uppercase">
        {initials}
      </span>
    </div>
  );
}

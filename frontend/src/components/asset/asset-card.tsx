import NextLink from 'next/link';
import { Download, Bookmark } from 'lucide-react';
import { ThumbnailImage } from './thumbnail-image';
import { EngineLogo } from './engine-logo';
import { SaveButton } from './save-button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { AssetSummary } from '@/lib/api/types';

interface BaseProps {
  asset: AssetSummary;
  className?: string;
  priority?: boolean;
  isSaved?: boolean;
  isOwner?: boolean;
  fallbackThumbnail?: string | null;
  tags?: { slug: string; displayName: string }[];
  href?: string;
  /** Extra action node rendered in the row variant (e.g. quick download). */
  trailingAction?: React.ReactNode;
  hidden?: boolean;
}

type GridProps = BaseProps & { variant: 'grid' };
type CompactProps = BaseProps & { variant: 'compact' };
type FeatureProps = BaseProps & { variant: 'feature'; bannerUrl?: string | null };
type RowProps = BaseProps & { variant: 'row'; onHide?: () => void; onQuickDownload?: () => void };

type AssetCardProps = GridProps | CompactProps | FeatureProps | RowProps;

function assetHref(asset: AssetSummary): string {
  return `/assets/${asset.slug || asset.id}`;
}

function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
}

export function AssetCard(props: AssetCardProps) {
  switch (props.variant) {
    case 'grid':
      return <GridCard {...props} />;
    case 'compact':
      return <CompactCard {...props} />;
    case 'feature':
      return <FeatureCard {...props} />;
    case 'row':
      return <RowCard {...props} />;
  }
}

/* ------------------------------ GRID ------------------------------ */

function GridCard({
  asset,
  priority,
  isSaved = false,
  isOwner = false,
  fallbackThumbnail,
  tags,
  className,
  href,
  hidden,
}: GridProps) {
  return (
    <article
      className={cn(
        'group relative isolate flex flex-col rounded-[20px] border border-line bg-surface',
        'transition-[transform,box-shadow,border-color] duration-200 ease-out-soft',
        'hover:-translate-y-px hover:shadow-2 hover:border-line-strong',
        'focus-within:ring-2 focus-within:ring-focus focus-within:ring-offset-2',
        hidden && 'opacity-60',
        className,
      )}
    >
      <div className="relative aspect-[16/9]">
        <ThumbnailImage
          src={asset.thumbnailUrl}
          fallback={fallbackThumbnail}
          alt={asset.title}
          priority={priority}
          unoptimized
        />
        {!isOwner ? (
          <SaveButton assetId={asset.id} initialSaved={isSaved} />
        ) : (
          <span className="absolute top-2.5 right-2.5 z-10 inline-flex h-7 px-2.5 items-center rounded-full bg-white/85 backdrop-blur-[6px] text-[11px] font-medium text-ink-2 border border-white/60">
            Your asset
          </span>
        )}
      </div>
      <div className="flex-1 flex flex-col p-4">
        <div className="flex items-center gap-1.5 text-caption text-ink-3 mb-2">
          <EngineLogo engine={asset.engine} size="sm" />
          <span className="truncate">{asset.categoryName}</span>
        </div>
        <h3 className="font-display text-h3 text-ink tracking-[-0.005em] line-clamp-1 leading-tight">
          <NextLink
            href={href ?? assetHref(asset)}
            prefetch={true}
            className="focus-visible:outline-none after:absolute after:inset-0 after:rounded-[20px]"
          >
            {asset.title}
          </NextLink>
        </h3>
        <p className="mt-1.5 text-[13.5px] leading-[1.5] text-ink-2 line-clamp-2">
          {asset.shortDescription}
        </p>
        {tags && tags.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {tags.slice(0, 3).map((t) => (
              <Badge key={t.slug} variant="neutral" size="sm">
                {t.displayName}
              </Badge>
            ))}
            {tags.length > 3 ? (
              <span className="text-caption text-ink-3">+{tags.length - 3}</span>
            ) : null}
          </div>
        ) : null}
        <div className="mt-auto pt-3 flex items-center justify-between text-caption text-ink-3 geist-tnum">
          <span className="truncate">by {asset.ownerDisplayName}</span>
          <span className="inline-flex items-center gap-3 shrink-0">
            <span className="inline-flex items-center gap-1">
              <Download className="h-3 w-3" strokeWidth={2.25} />
              {formatCount(asset.totalDownloads)}
            </span>
            <span className="inline-flex items-center gap-1">
              <Bookmark className="h-3 w-3" strokeWidth={2.25} />
              {formatCount(asset.totalSaves)}
            </span>
          </span>
        </div>
      </div>
    </article>
  );
}

/* ----------------------------- COMPACT ----------------------------- */

function CompactCard({
  asset,
  priority,
  isSaved = false,
  isOwner = false,
  fallbackThumbnail,
  className,
  href,
}: CompactProps) {
  return (
    <article
      className={cn(
        'group relative isolate flex flex-col rounded-[16px] border border-line bg-surface',
        'transition-[transform,box-shadow,border-color] duration-200 ease-out-soft',
        'hover:-translate-y-px hover:shadow-2 hover:border-line-strong',
        'focus-within:ring-2 focus-within:ring-focus focus-within:ring-offset-2',
        'w-[220px] shrink-0',
        className,
      )}
    >
      <div className="relative aspect-[16/9]">
        <ThumbnailImage
          src={asset.thumbnailUrl}
          fallback={fallbackThumbnail}
          alt={asset.title}
          priority={priority}
          className="rounded-[16px] rounded-b-none"
          unoptimized
        />
        {!isOwner ? (
          <SaveButton assetId={asset.id} initialSaved={isSaved} className="top-1.5 right-1.5 h-8 w-8" />
        ) : null}
      </div>
      <div className="p-3">
        <h4 className="text-[14px] font-semibold text-ink tracking-[-0.005em] line-clamp-1 leading-tight">
          <NextLink
            href={href ?? assetHref(asset)}
            prefetch={true}
            className="focus-visible:outline-none after:absolute after:inset-0 after:rounded-[16px]"
          >
            {asset.title}
          </NextLink>
        </h4>
        <div className="mt-1.5 flex items-center justify-between text-caption text-ink-3 geist-tnum">
          <span className="inline-flex items-center gap-1">
            <EngineLogo engine={asset.engine} size="sm" />
          </span>
          <span className="inline-flex items-center gap-1">
            <Download className="h-3 w-3" strokeWidth={2.25} />
            {formatCount(asset.totalDownloads)}
          </span>
        </div>
      </div>
    </article>
  );
}

/* ----------------------------- FEATURE ----------------------------- */

function FeatureCard({
  asset,
  bannerUrl,
  fallbackThumbnail,
  isSaved = false,
  isOwner = false,
  className,
  href,
  priority,
}: FeatureProps) {
  return (
    <article
      className={cn(
        'group relative isolate flex flex-col overflow-hidden rounded-[28px] bg-surface-inverse text-white',
        'min-h-[420px] md:min-h-[480px]',
        className,
      )}
    >
      <div className="absolute inset-0">
        <ThumbnailImage
          src={bannerUrl || asset.thumbnailUrl}
          fallback={fallbackThumbnail}
          alt={asset.title}
          priority={priority}
          className="!rounded-[28px] !after:hidden"
          unoptimized
        />
      </div>
      {/* Gradient overlay — DS-safe legibility */}
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-tr from-[rgba(14,17,22,0.82)] via-[rgba(14,17,22,0.42)] to-transparent"
      />
      <div
        aria-hidden
        className="absolute inset-0 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]"
      />
      <div className="relative mt-auto p-7 md:p-10 max-w-[640px]">
        <Badge variant="solid" size="md" className="mb-4 bg-white/15 text-white border-white/0">
          Featured
        </Badge>
        <h2 className="display-lg !text-white leading-[1.05]">
          <NextLink
            href={href ?? assetHref(asset)}
            prefetch={true}
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0e1116] after:absolute after:inset-0 after:rounded-[28px]"
          >
            {asset.title}
          </NextLink>
        </h2>
        <p className="mt-3 text-body-lg text-white/85 line-clamp-2 max-w-[520px]">
          {asset.shortDescription}
        </p>
        <div className="mt-6 flex items-center gap-3 text-[13px] text-white/70">
          <span className="inline-flex items-center gap-1.5">
            <EngineLogo engine={asset.engine} size="sm" className="text-white/80" />
            <span>{asset.categoryName}</span>
          </span>
          <span aria-hidden>·</span>
          <span>by {asset.ownerDisplayName}</span>
        </div>
      </div>
      {!isOwner ? (
        <SaveButton
          assetId={asset.id}
          initialSaved={isSaved}
          className="top-5 right-5 h-10 w-10 z-20"
          hideUntilHover={false}
        />
      ) : null}
    </article>
  );
}

/* ------------------------------- ROW ------------------------------- */

function RowCard({
  asset,
  isSaved = false,
  isOwner = false,
  fallbackThumbnail,
  className,
  href,
  hidden,
  onHide,
  onQuickDownload,
  trailingAction,
}: RowProps) {
  return (
    <article
      className={cn(
        'group relative grid grid-cols-[200px_1fr_auto] gap-5 items-center p-3 rounded-[16px] border border-line bg-surface',
        'transition-colors duration-200 ease-out-soft hover:border-line-strong',
        'focus-within:ring-2 focus-within:ring-focus focus-within:ring-offset-2',
        hidden && 'opacity-60',
        className,
      )}
    >
      <div className="relative aspect-[16/9] w-[200px]">
        <ThumbnailImage
          src={asset.thumbnailUrl}
          fallback={fallbackThumbnail}
          alt={asset.title}
          className="rounded-[12px]"
          unoptimized
        />
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 text-caption text-ink-3 mb-1">
          <EngineLogo engine={asset.engine} size="sm" />
          <span className="truncate">{asset.categoryName}</span>
        </div>
        <h3 className="font-display text-[18px] font-semibold text-ink tracking-[-0.005em] line-clamp-1">
          <NextLink
            href={href ?? assetHref(asset)}
            prefetch={true}
            className="focus-visible:outline-none after:absolute after:inset-0 after:rounded-[16px]"
          >
            {asset.title}
          </NextLink>
        </h3>
        <p className="mt-1 text-[13.5px] text-ink-2 line-clamp-2 max-w-[640px]">
          {asset.shortDescription}
        </p>
        <div className="mt-2 flex items-center gap-3 text-caption text-ink-3 geist-tnum">
          <span>by {asset.ownerDisplayName}</span>
          <span aria-hidden>·</span>
          <span className="inline-flex items-center gap-1">
            <Download className="h-3 w-3" strokeWidth={2.25} />
            {formatCount(asset.totalDownloads)}
          </span>
          <span aria-hidden>·</span>
          <span className="inline-flex items-center gap-1">
            <Bookmark className="h-3 w-3" strokeWidth={2.25} />
            {formatCount(asset.totalSaves)}
          </span>
        </div>
      </div>
      <div className="relative z-10 flex items-center gap-1">
        {onQuickDownload ? (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onQuickDownload();
            }}
            aria-label="Quick download"
            className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] text-ink-2 hover:bg-surface-muted hover:text-ink transition-colors duration-120 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
          >
            <Download className="h-4 w-4" strokeWidth={2.25} />
          </button>
        ) : null}
        {!isOwner ? (
          <SaveButton assetId={asset.id} initialSaved={isSaved} variant="ghost-pill" />
        ) : null}
        {onHide ? (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onHide();
            }}
            aria-label={hidden ? 'Unhide' : 'Hide'}
            className="inline-flex h-9 px-3 items-center rounded-[10px] text-[13px] font-medium text-ink-2 hover:bg-surface-muted hover:text-ink transition-colors duration-120 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
          >
            {hidden ? 'Unhide' : 'Hide'}
          </button>
        ) : null}
        {trailingAction}
      </div>
    </article>
  );
}

import Image from 'next/image';
import { Fragment, type CSSProperties, type ReactNode } from 'react';
import type { TipTapDoc, TipTapMark, TipTapNode } from '@/lib/api/types';
import { cn } from '@/lib/utils';

interface TipTapRendererProps {
  doc?: TipTapDoc | null;
  variant?: 'full' | 'lite';
  className?: string;
}

/**
 * Lightweight read-only TipTap JSON → React renderer. The publish editor
 * lives in Part 3; here we only need to *display* the JSON that the
 * editor wrote. Supports the spec's "full" extensions for descriptions
 * and the "lite" subset for release notes and (in Part 3) comments.
 *
 * Allowed embeds are restricted to YouTube + Vimeo, never arbitrary iframes.
 */
export function TipTapRenderer({ doc, variant = 'full', className }: TipTapRendererProps) {
  if (!doc || !doc.content) {
    return (
      <div className={cn('text-body-sm text-ink-3 italic', className)}>
        No content provided.
      </div>
    );
  }
  return (
    <div
      className={cn(
        'tiptap-prose max-w-prose',
        '[&>:first-child]:mt-0',
        className,
      )}
    >
      {doc.content.map((node, i) => (
        <NodeRenderer key={i} node={node} variant={variant} />
      ))}
    </div>
  );
}

function NodeRenderer({ node, variant }: { node: TipTapNode; variant: 'full' | 'lite' }) {
  const childContent =
    node.content && node.content.length > 0
      ? node.content.map((child, i) => <NodeRenderer key={i} node={child} variant={variant} />)
      : null;

  switch (node.type) {
    case 'paragraph':
      return (
        <p className="my-3 text-body text-ink-2 leading-[1.65]">
          {childContent ?? <br />}
        </p>
      );
    case 'heading': {
      const level = clampHeadingLevel(node.attrs?.level);
      const Tag = `h${level}` as 'h1' | 'h2' | 'h3';
      const cls = {
        1: 'font-display text-h1 text-ink tracking-[-0.015em] mt-10 mb-4',
        2: 'font-display text-h2 text-ink tracking-[-0.01em] mt-8 mb-3',
        3: 'font-display text-h3 text-ink tracking-[-0.005em] mt-6 mb-2',
      }[level];
      return <Tag className={cls}>{childContent}</Tag>;
    }
    case 'bulletList':
      return <ul className="my-3 list-disc pl-6 marker:text-ink-3 space-y-1 text-body text-ink-2">{childContent}</ul>;
    case 'orderedList':
      return (
        <ol
          start={typeof node.attrs?.start === 'number' ? (node.attrs.start as number) : undefined}
          className="my-3 list-decimal pl-6 marker:text-ink-3 space-y-1 text-body text-ink-2"
        >
          {childContent}
        </ol>
      );
    case 'listItem':
      return <li className="leading-[1.6]">{childContent}</li>;
    case 'blockquote':
      return (
        <blockquote className="my-5 border-l-2 border-brand-blue/50 bg-brand-blue-50/40 pl-5 pr-4 py-3 rounded-r-[8px] text-ink-2 italic">
          {childContent}
        </blockquote>
      );
    case 'codeBlock':
      return (
        <pre className="my-5 rounded-[14px] border border-line bg-surface-inverse text-white px-4 py-3.5 overflow-x-auto text-[13px] leading-[1.6] font-mono">
          <code>
            {flattenText(node)}
          </code>
        </pre>
      );
    case 'horizontalRule':
      return <hr className="my-7 border-0 h-px bg-line" />;
    case 'image':
      return <RenderedImage node={node} />;
    case 'video':
      return <RenderedVideo node={node} />;
    case 'iframe':
    case 'embed':
      return variant === 'full' ? <RenderedEmbed node={node} /> : null;
    case 'table':
      return (
        <div className="my-5 overflow-x-auto rounded-[14px] border border-line">
          <table className="w-full border-collapse text-[14px]">
            <tbody>{childContent}</tbody>
          </table>
        </div>
      );
    case 'tableRow':
      return <tr className="border-b border-line last:border-0">{childContent}</tr>;
    case 'tableHeader':
      return (
        <th className="bg-surface-muted text-left text-eyebrow uppercase text-ink-3 px-3 py-2 align-top">
          {childContent}
        </th>
      );
    case 'tableCell':
      return <td className="px-3 py-2 text-ink-2 align-top">{childContent}</td>;
    case 'text':
      return <TextNode node={node} />;
    case 'hardBreak':
      return <br />;
    default:
      // Unknown node type — render its content if any, never crash.
      return <>{childContent}</>;
  }
}

function TextNode({ node }: { node: TipTapNode }) {
  let element: ReactNode = node.text ?? '';
  if (!node.marks || node.marks.length === 0) return <>{element}</>;
  // Order: text → code → underline → strike → italic → bold → highlight → link → textStyle
  const ordered = [...node.marks].sort((a, b) => markOrder(a.type) - markOrder(b.type));
  for (const mark of ordered) {
    element = applyMark(mark, element);
  }
  return <>{element}</>;
}

function markOrder(type: string): number {
  return ({
    code: 1,
    underline: 2,
    strike: 3,
    italic: 4,
    bold: 5,
    highlight: 6,
    textStyle: 7,
    link: 8,
  } as Record<string, number>)[type] ?? 99;
}

function applyMark(mark: TipTapMark, child: ReactNode): ReactNode {
  switch (mark.type) {
    case 'bold':
      return <strong className="font-semibold text-ink">{child}</strong>;
    case 'italic':
      return <em>{child}</em>;
    case 'underline':
      return <u className="underline underline-offset-2">{child}</u>;
    case 'strike':
      return <s>{child}</s>;
    case 'code':
      return (
        <code className="font-mono text-[0.92em] bg-surface-muted px-1.5 py-0.5 rounded-[6px] border border-line text-ink">
          {child}
        </code>
      );
    case 'highlight': {
      const color = typeof mark.attrs?.color === 'string' ? mark.attrs.color : '#fef6e0';
      return <mark style={{ background: color }}>{child}</mark>;
    }
    case 'textStyle': {
      const style: CSSProperties = {};
      if (typeof mark.attrs?.color === 'string') style.color = mark.attrs.color as string;
      return <span style={style}>{child}</span>;
    }
    case 'link': {
      const href = typeof mark.attrs?.href === 'string' ? (mark.attrs.href as string) : '#';
      const safe = sanitizeUrl(href);
      const isExternal = /^https?:\/\//.test(safe);
      return (
        <a
          href={safe}
          className="link-inline"
          {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        >
          {child}
        </a>
      );
    }
    default:
      return <Fragment>{child}</Fragment>;
  }
}

function clampHeadingLevel(value: unknown): 1 | 2 | 3 {
  const n = typeof value === 'number' ? value : 1;
  if (n >= 3) return 3;
  if (n === 2) return 2;
  return 1;
}

function flattenText(node: TipTapNode): string {
  if (node.text) return node.text;
  if (!node.content) return '';
  return node.content.map(flattenText).join('');
}

function sanitizeUrl(url: string): string {
  const lower = url.trim().toLowerCase();
  if (lower.startsWith('javascript:') || lower.startsWith('data:')) return '#';
  return url;
}

function RenderedImage({ node }: { node: TipTapNode }) {
  const src = typeof node.attrs?.src === 'string' ? (node.attrs.src as string) : null;
  const alt = typeof node.attrs?.alt === 'string' ? (node.attrs.alt as string) : '';
  const width = typeof node.attrs?.width === 'number' ? (node.attrs.width as number) : 1280;
  const height = typeof node.attrs?.height === 'number' ? (node.attrs.height as number) : 720;
  if (!src) return null;
  return (
    <figure className="my-6">
      <div className="rounded-[16px] overflow-hidden border border-line bg-surface-muted">
        <Image
          src={src}
          alt={alt}
          width={width}
          height={height}
          className="w-full h-auto block"
          sizes="(min-width: 1024px) 720px, 100vw"
          unoptimized
        />
      </div>
      {alt ? <figcaption className="mt-2 text-caption text-ink-3 text-center">{alt}</figcaption> : null}
    </figure>
  );
}

function RenderedVideo({ node }: { node: TipTapNode }) {
  const src = typeof node.attrs?.src === 'string' ? (node.attrs.src as string) : null;
  if (!src) return null;
  return (
    <figure className="my-6">
      <video
        controls
        preload="metadata"
        className="w-full rounded-[16px] border border-line bg-black"
      >
        <source src={src} />
      </video>
    </figure>
  );
}

function RenderedEmbed({ node }: { node: TipTapNode }) {
  const src = typeof node.attrs?.src === 'string' ? (node.attrs.src as string) : null;
  if (!src) return null;
  const embed = toEmbedUrl(src);
  if (!embed) return null;
  return (
    <figure className="my-6">
      <div className="relative aspect-video overflow-hidden rounded-[16px] border border-line bg-surface-muted">
        <iframe
          src={embed}
          title="Embedded media"
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          className="absolute inset-0 h-full w-full"
        />
      </div>
    </figure>
  );
}

function toEmbedUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (/(^|\.)youtube\.com$/.test(url.hostname)) {
      const v = url.searchParams.get('v');
      if (v) return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(v)}`;
      const path = url.pathname.match(/\/embed\/([\w-]+)/);
      if (path) return `https://www.youtube-nocookie.com${path[0]}`;
    }
    if (url.hostname === 'youtu.be') {
      const id = url.pathname.replace(/^\//, '');
      if (id) return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}`;
    }
    if (/(^|\.)vimeo\.com$/.test(url.hostname)) {
      const id = url.pathname.match(/\/(\d+)/)?.[1];
      if (id) return `https://player.vimeo.com/video/${id}`;
    }
  } catch {
    return null;
  }
  return null;
}

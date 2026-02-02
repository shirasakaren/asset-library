'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CodeBlockProps {
  code: string;
  language?: string;
  showCopy?: boolean;
  className?: string;
  filename?: string;
}

export function CodeBlock({ code, language, showCopy = true, className, filename }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };
  return (
    <div
      className={cn(
        'group relative rounded-[14px] border border-line bg-surface-inverse text-white overflow-hidden',
        className,
      )}
    >
      {(language || filename) && (
        <div className="flex items-center justify-between px-4 h-9 border-b border-white/10 text-[12px] text-white/70 font-mono">
          <span>{filename ?? language}</span>
          {language && filename ? <span className="text-white/40">{language}</span> : null}
        </div>
      )}
      <pre className="px-4 py-3.5 overflow-x-auto text-[13px] leading-[1.6] font-mono">
        <code>{code}</code>
      </pre>
      {showCopy ? (
        <button
          type="button"
          onClick={handleCopy}
          aria-label={copied ? 'Copied' : 'Copy code'}
          className="absolute top-2 right-2 inline-flex h-8 w-8 items-center justify-center rounded-[8px] text-white/70 hover:bg-white/10 hover:text-white opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity duration-120 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
        >
          {copied ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> : <Copy className="h-3.5 w-3.5" strokeWidth={2.25} />}
        </button>
      ) : null}
    </div>
  );
}

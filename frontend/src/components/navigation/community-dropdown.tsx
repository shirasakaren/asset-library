'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, ExternalLink } from 'lucide-react';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover';
import { publicEnv } from '@/lib/env.public';
import { cn } from '@/lib/utils';

export function CommunityDropdown() {
  const t = useTranslations('nav');
  const [open, setOpen] = useState(false);

  const items: { label: string; hint: string; href: string | undefined }[] = [
    {
      label: t('communityDocs'),
      hint: t('communityDocsHint'),
      href: publicEnv.NEXT_PUBLIC_COMMUNITY_DOCS_URL,
    },
    {
      label: t('communityLearning'),
      hint: t('communityLearningHint'),
      href: publicEnv.NEXT_PUBLIC_COMMUNITY_LEARNING_URL,
    },
    {
      label: t('communityHelp'),
      hint: t('communityHelpHint'),
      href: publicEnv.NEXT_PUBLIC_COMMUNITY_HELP_URL,
    },
  ];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          className={cn(
            'inline-flex items-center gap-1 h-10 px-1 text-[14px] font-medium text-ink-2 hover:text-ink transition-colors duration-120 relative',
            'after:absolute after:bottom-3 after:left-0 after:right-0 after:h-[2px] after:bg-transparent',
            'data-[state=open]:text-ink',
          )}
        >
          {t('community')}
          <ChevronDown className="h-3.5 w-3.5" strokeWidth={2.25} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        className="min-w-[320px] p-2"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
      >
        <ul className="flex flex-col">
          {items.map((it) => {
            const enabled = Boolean(it.href);
            return (
              <li key={it.label}>
                {enabled ? (
                  <a
                    href={it.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-start gap-3 rounded-[10px] p-2.5 hover:bg-surface-muted transition-colors duration-120 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-1"
                  >
                    <span className="mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-[8px] bg-brand-blue-50 text-brand-blue">
                      <ExternalLink className="h-3.5 w-3.5" strokeWidth={2.25} />
                    </span>
                    <div className="min-w-0">
                      <div className="text-[14px] font-medium text-ink">{it.label}</div>
                      <div className="text-[12.5px] text-ink-3 mt-0.5">{it.hint}</div>
                    </div>
                  </a>
                ) : (
                  <div
                    aria-disabled="true"
                    title="Coming soon"
                    className="flex items-start gap-3 rounded-[10px] p-2.5 opacity-60 cursor-not-allowed"
                  >
                    <span className="mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-[8px] bg-surface-muted text-ink-3">
                      <ExternalLink className="h-3.5 w-3.5" strokeWidth={2.25} />
                    </span>
                    <div className="min-w-0">
                      <div className="text-[14px] font-medium text-ink-2">
                        {it.label}
                        <span className="ml-2 inline-flex items-center h-4 px-1.5 rounded-full bg-surface-muted text-[10px] uppercase tracking-[0.12em] text-ink-3">
                          Soon
                        </span>
                      </div>
                      <div className="text-[12.5px] text-ink-3 mt-0.5">{it.hint}</div>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

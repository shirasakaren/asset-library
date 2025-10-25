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

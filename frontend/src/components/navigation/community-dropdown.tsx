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

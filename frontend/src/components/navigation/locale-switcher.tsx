'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Globe, Check } from 'lucide-react';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { toast } from '@/components/ui/toaster';

const LOCALES = [
  { code: 'en', labelKey: 'english' as const },
  { code: 'id', labelKey: 'indonesian' as const },
];

interface LocaleSwitcherProps {
  className?: string;
}

export function LocaleSwitcher({ className }: LocaleSwitcherProps) {
  const router = useRouter();
  const t = useTranslations('locale');
  const tCommon = useTranslations('common');
  const current = useLocale();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function change(next: string) {
    if (next === current || isPending) return;
    setOpen(false);
    startTransition(async () => {
      try {
        await fetch('/api/me/locale', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ locale: next }),

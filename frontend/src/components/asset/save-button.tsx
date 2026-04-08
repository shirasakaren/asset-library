'use client';

import { useState } from 'react';
import { Bookmark, BookmarkCheck, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { useSaveToggle } from '@/lib/hooks/use-save-toggle';

interface SaveButtonProps {
  assetId: string;
  initialSaved: boolean;
  variant?: 'overlay' | 'pill' | 'ghost-pill';
  className?: string;
  hideUntilHover?: boolean;
}

/**
 * Heart/bookmark toggle. Three render variants:
 * - overlay: floats over a card thumbnail (top-right). Hidden until hover unless saved.
 * - pill:    full pill button used in the asset detail rail.
 * - ghost-pill: ghost variant used in Library row layout.
 */
export function SaveButton({
  assetId,
  initialSaved,
  variant = 'overlay',
  className,
  hideUntilHover = true,
}: SaveButtonProps) {
  const t = useTranslations('asset');
  const [optimistic, setOptimistic] = useState(initialSaved);
  const { mutate, isPending } = useSaveToggle();

  const handleClick = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const next = !optimistic;
    setOptimistic(next);
    mutate(
      { assetId, nextSaved: next },
      {
        onError: () => setOptimistic(!next),
      },
    );
  };

  const Icon = optimistic ? BookmarkCheck : Bookmark;
  const label = optimistic ? t('saved') : t('save');

  if (variant === 'overlay') {
    return (
      <button
        type="button"
        aria-label={label}
        aria-pressed={optimistic}
        onClick={handleClick}
        className={cn(
          'absolute top-2.5 right-2.5 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full',
          'border border-white/40 backdrop-blur-[8px] transition-all duration-200 ease-out-soft',
          optimistic
            ? 'bg-ink text-white opacity-100'
            : 'bg-white/85 text-ink opacity-100 hover:bg-white',
          hideUntilHover && !optimistic ? 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100' : '',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2',
          className,
        )}
        disabled={isPending}
      >
        {isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.25} />
        ) : (
          <Icon className="h-4 w-4" strokeWidth={2.25} fill={optimistic ? 'currentColor' : 'none'} />
        )}
      </button>
    );
  }

  if (variant === 'pill') {
    return (
      <button
        type="button"
        aria-pressed={optimistic}
        onClick={handleClick}
        disabled={isPending}
        className={cn(

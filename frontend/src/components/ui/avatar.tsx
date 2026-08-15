import { cn } from '@/lib/utils';
import type { AvatarTokens } from '@/lib/avatar';

interface AvatarProps {
  data: AvatarTokens;
  size?: 24 | 32 | 36 | 48 | 64;
  className?: string;
}

const sizeText = {
  24: 'text-[10px]',
  32: 'text-[12px]',
  36: 'text-[13px]',
  48: 'text-[16px]',
  64: 'text-[20px]',
} as const;

export function Avatar({ data, size = 32, className }: AvatarProps) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex items-center justify-center rounded-full font-display font-semibold tracking-[-0.01em] uppercase select-none',
        sizeText[size],
        className,
      )}
      style={{
        width: size,
        height: size,
        background: data.bgColor,
        color: data.fgColor,
      }}
    >
      {data.initials}
    </span>
  );
}

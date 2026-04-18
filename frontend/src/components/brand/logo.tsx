import Link from 'next/link';
import Image from 'next/image';
import { cn } from '@/lib/utils';

type LogoSize = 'sm' | 'md' | 'lg';

const sizePx: Record<LogoSize, number> = { sm: 24, md: 32, lg: 48 };

interface LogoProps {
  size?: LogoSize;
  href?: string;
  withWordmark?: boolean;
  className?: string;
  priority?: boolean;
}

export function Logo({
  size = 'md',
  href = '/',
  withWordmark = true,
  className,
  priority = false,
}: LogoProps) {
  const px = sizePx[size];
  const mark = (
    <Image
      src="/brand/mgm-logo.svg"
      alt="MGM"
      width={px}
      height={px}
      priority={priority}
      className="select-none"
    />
  );
  const content = (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      {mark}
      {withWordmark ? (
        <span
          className={cn(
            'font-display font-semibold tracking-[-0.015em] text-ink',
            size === 'sm' && 'text-[15px]',
            size === 'md' && 'text-[17px]',
            size === 'lg' && 'text-h2',
          )}
        >
          Asset Library
        </span>
      ) : null}
    </span>
  );
  if (!href) return content;
  return (
    <Link
      href={href}
      aria-label="MGM Asset Library home"
      className="inline-flex items-center rounded-sm transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
    >
      {content}
    </Link>
  );
}

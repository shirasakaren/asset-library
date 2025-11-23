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

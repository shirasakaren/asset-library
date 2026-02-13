import NextLink, { type LinkProps as NextLinkProps } from 'next/link';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

type Variant = 'inline' | 'nav' | 'plain';

interface LinkProps
  extends Omit<NextLinkProps, 'href'>,
    Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof NextLinkProps> {
  href: NextLinkProps['href'];
  variant?: Variant;
  external?: boolean;
  children?: ReactNode;
}

const variantClass: Record<Variant, string> = {
  inline:
    'text-brand-blue underline underline-offset-[3px] decoration-1 hover:decoration-2 transition-[text-decoration] duration-200',
  nav: 'text-ink-2 hover:text-ink transition-colors duration-120 no-underline',
  plain: 'text-current no-underline',
};

export function Link({
  variant = 'plain',
  external,
  className,
  children,
  href,
  ...rest
}: LinkProps) {
  const isExternal =
    external ?? (typeof href === 'string' && /^https?:\/\//.test(href));
  if (isExternal && typeof href === 'string') {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(variantClass[variant], className)}
        {...rest}
      >
        {children}
      </a>
    );
  }
  return (
    <NextLink href={href} className={cn(variantClass[variant], className)} {...rest}>
      {children}
    </NextLink>
  );
}

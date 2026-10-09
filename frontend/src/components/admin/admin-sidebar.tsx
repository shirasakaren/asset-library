'use client';

import NextLink from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Package,
  Star,
  FolderTree,
  Tag,
  ScrollText,
  Flag,
  Inbox,
  HardDrive,
  Users,
  History,
  Webhook,
  ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Item {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  external?: boolean;
}

interface Group {
  title: string;
  items: Item[];
}

const GROUPS: Group[] = [
  {
    title: 'Overview',
    items: [{ href: '/admin', label: 'Dashboard', icon: LayoutDashboard }],
  },
  {
    title: 'Content',
    items: [
      { href: '/admin/assets', label: 'Assets', icon: Package },
      { href: '/admin/featured', label: 'Featured', icon: Star },
      { href: '/admin/categories', label: 'Categories', icon: FolderTree },
      { href: '/admin/tags', label: 'Tags', icon: Tag },
      { href: '/admin/licenses', label: 'Licenses', icon: ScrollText },
    ],
  },
  {
    title: 'Operations',
    items: [
      { href: '/admin/reports', label: 'Reports', icon: Flag },
      { href: '/admin/requests', label: 'Requests', icon: Inbox },
      { href: '/admin/storage', label: 'Storage', icon: HardDrive },
    ],
  },
  {
    title: 'People',
    items: [
      { href: '/admin/users', label: 'Users', icon: Users },
      { href: '/admin/audit', label: 'Audit log', icon: History },
    ],
  },
  {
    title: 'System',
    items: [{ href: '/admin/webhooks', label: 'Webhooks', icon: Webhook }],
  },
];

export function AdminSidebar() {
  const pathname = usePathname() ?? '';

  return (
    <aside
      aria-label="Admin sections"
      className="pr-2 lg:sticky lg:top-20 lg:max-h-[calc(100vh-5rem)] lg:self-start lg:overflow-y-auto"
    >
      <ul className="flex flex-col gap-6">
        {GROUPS.map((group) => (
          <li key={group.title}>
            <p className="mb-2 px-2 text-eyebrow uppercase tracking-[0.12em] text-ink-3">
              {group.title}
            </p>
            <ul className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const active =
                  !item.external &&
                  (item.href === '/admin'
                    ? pathname === '/admin'
                    : pathname === item.href || pathname.startsWith(`${item.href}/`));
                const Icon = item.icon;
                const body = (
                  <span
                    className={cn(
                      'group flex h-9 items-center gap-2.5 rounded-[10px] px-2.5 text-[13.5px] transition-colors duration-120',
                      active
                        ? 'bg-surface-muted font-medium text-ink'
                        : 'hover:bg-surface-muted/60 text-ink-2 hover:text-ink',
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" strokeWidth={2.25} />
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.external ? (
                      <ExternalLink className="h-3 w-3 text-ink-3" strokeWidth={2.25} />
                    ) : null}
                  </span>
                );
                return (
                  <li key={item.href}>
                    {item.external ? (
                      <a
                        href={item.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block rounded-[10px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
                      >
                        {body}
                      </a>
                    ) : (
                      <NextLink
                        href={item.href}
                        className="block rounded-[10px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
                      >
                        {body}
                      </NextLink>
                    )}
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>
    </aside>
  );
}

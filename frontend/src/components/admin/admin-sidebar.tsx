'use client';

import NextLink from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
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
  ListChecks,
  ExternalLink,
} from 'lucide-react';
import { publicEnv } from '@/lib/env.public';
import { toast } from '@/components/ui/toaster';
import { cn } from '@/lib/utils';

interface Item {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  external?: boolean;
  /** When true, the link injects ?access_token=… from the current session. */
  needsAccessToken?: boolean;
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
    items: [
      { href: '/admin/webhooks', label: 'Webhooks', icon: Webhook },
      {
        href: `${publicEnv.NEXT_PUBLIC_API_URL.replace(/\/$/, '')}/admin/queues`,
        label: 'Queues',
        icon: ListChecks,
        external: true,
        needsAccessToken: true,
      },
    ],
  },
];

export function AdminSidebar() {
  const pathname = usePathname() ?? '';
  const { data: session } = useSession();

  const openWithToken = (baseHref: string) => {
    const token = session?.accessToken;
    if (!token) {
      toast.error('Sign-in token missing', {
        description: 'Reload the page and try again.',
      });
      return;
    }
    const url = `${baseHref}${baseHref.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(token)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <aside
      aria-label="Admin sections"
      className="lg:sticky lg:top-20 lg:self-start lg:max-h-[calc(100vh-5rem)] lg:overflow-y-auto pr-2"
    >
      <ul className="flex flex-col gap-6">
        {GROUPS.map((group) => (
          <li key={group.title}>
            <p className="text-eyebrow uppercase tracking-[0.12em] text-ink-3 px-2 mb-2">
              {group.title}
            </p>
            <ul className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const active =
                  !item.external &&

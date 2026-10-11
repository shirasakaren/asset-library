import {
  BookOpen,
  Box,
  Code,
  Film,
  Folder,
  Image as ImageIcon,
  LayoutTemplate,
  Music,
  Palette,
  Sparkles,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

// `iconKey` is a decorative icon name (the preview has no uploaded icon files).
const ICONS: Record<string, LucideIcon> = {
  box: Box,
  image: ImageIcon,
  music: Music,
  sparkles: Sparkles,
  film: Film,
  wrench: Wrench,
  code: Code,
  'layout-template': LayoutTemplate,
  palette: Palette,
  'book-open': BookOpen,
};

export const CATEGORY_ICON_KEYS = Object.keys(ICONS);

/** Glyph for a category's `iconKey`; unknown or missing keys get a generic folder. */
export function CategoryIcon({
  iconKey,
  className,
}: {
  iconKey: string | null | undefined;
  className?: string;
}) {
  const Icon = (iconKey ? ICONS[iconKey.toLowerCase()] : undefined) ?? Folder;
  return <Icon className={className} strokeWidth={2} aria-hidden="true" />;
}

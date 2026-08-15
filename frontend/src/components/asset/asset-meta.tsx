import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { EngineLogo, engineLabels } from './engine-logo';
import type { Engine } from '@/lib/api/types';

interface AssetMetaProps {
  engine: Engine;
  categoryName?: string;
  licenseName?: string;
  className?: string;
  size?: 'sm' | 'md';
}

export function AssetMeta({
  engine,
  categoryName,
  licenseName,
  className,
  size = 'sm',
}: AssetMetaProps) {
  const chipClass = cn(
    'inline-flex items-center gap-1.5 rounded-full bg-surface-muted border border-line text-ink-2',
    size === 'sm' ? 'h-6 px-2.5 text-[12px]' : 'h-7 px-3 text-[13px]',
  );
  return (
    <div className={cn('inline-flex flex-wrap items-center gap-1.5', className)}>
      <span className={chipClass}>
        <EngineLogo engine={engine} size={size === 'sm' ? 'sm' : 'md'} />
        <span>{engineLabels[engine]}</span>
      </span>
      {categoryName ? (
        <Badge variant="neutral" size={size === 'sm' ? 'md' : 'lg'}>
          {categoryName}
        </Badge>
      ) : null}
      {licenseName ? (
        <Badge variant="outline" size={size === 'sm' ? 'md' : 'lg'}>
          {licenseName}
        </Badge>
      ) : null}
    </div>
  );
}

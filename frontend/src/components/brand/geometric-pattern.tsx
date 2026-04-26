import Image from 'next/image';
import { cn, hashString } from '@/lib/utils';

const TOTAL_TILES = 80;

type Variant = 'corner' | 'banner' | 'square' | 'strip';

interface GeometricPatternProps {
  variant?: Variant;
  seed?: string;
  className?: string;
  size?: number;
  rows?: number;
  cols?: number;
  ariaHidden?: boolean;
}

function tileUrl(n: number): string {
  return `/patterns/p-${n}.svg`;
}

function pickTiles(seed: string, count: number): number[] {
  // Deterministic selection that avoids immediate neighbour repeats.
  const out: number[] = [];
  let h = hashString(seed);
  for (let i = 0; i < count; i++) {
    h = (h * 1103515245 + 12345) >>> 0;
    let pick = (h % TOTAL_TILES) + 1;
    if (i > 0 && pick === out[i - 1]) {
      pick = (pick % TOTAL_TILES) + 1;
    }
    out.push(pick);
  }
  return out;
}

const VARIANT_GRID: Record<Variant, { rows: number; cols: number }> = {
  corner: { rows: 2, cols: 2 },
  banner: { rows: 2, cols: 6 },
  square: { rows: 3, cols: 3 },
  strip: { rows: 1, cols: 12 },
};

export function GeometricPattern({
  variant = 'corner',
  seed = 'mgm',
  className,
  size = 56,
  rows,
  cols,
  ariaHidden = true,
}: GeometricPatternProps) {
  const grid = { rows: rows ?? VARIANT_GRID[variant].rows, cols: cols ?? VARIANT_GRID[variant].cols };
  const tiles = pickTiles(seed, grid.rows * grid.cols);
  return (
    <div
      aria-hidden={ariaHidden}
      className={cn('grid select-none', className)}
      style={{
        gridTemplateColumns: `repeat(${grid.cols}, ${size}px)`,
        gridTemplateRows: `repeat(${grid.rows}, ${size}px)`,
        width: grid.cols * size,
        height: grid.rows * size,
      }}
    >
      {tiles.map((n, i) => (
        <Image
          key={`${n}-${i}`}
          src={tileUrl(n)}
          alt=""
          width={size}
          height={size}
          className="block"
          unoptimized
        />
      ))}
    </div>
  );
}

/**
 * Small empty-state pattern (max 200px square) used as the slot
 * inside EmptyState components.
 */
export function EmptyStatePattern({
  seed = 'empty',
  className,
}: {
  seed?: string;
  className?: string;
}) {
  return <GeometricPattern variant="square" seed={seed} size={56} className={className} />;
}

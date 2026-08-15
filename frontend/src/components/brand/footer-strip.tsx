const COLORS = ['#3a6dc5', '#f7bf33', '#0f8657', '#f94141'] as const;

interface FooterStripProps {
  cellPx?: number;
  className?: string;
}

/**
 * Full-width alternating squares strip (DS §7.8).
 * Repeats the four brand colors as 8 px cells across the viewport.
 */
export function FooterStrip({ cellPx = 8, className }: FooterStripProps) {
  const palette = COLORS.join(', ');
  return (
    <div
      aria-hidden
      role="presentation"
      className={className}
      style={{
        height: cellPx,
        width: '100%',
        backgroundImage: `linear-gradient(to right, ${COLORS.map(
          (c, i) => `${c} ${i * (100 / COLORS.length)}%, ${c} ${(i + 1) * (100 / COLORS.length)}%`,
        ).join(', ')})`,
        backgroundSize: `${cellPx * COLORS.length}px ${cellPx}px`,
        backgroundRepeat: 'repeat-x',
        backgroundPositionY: 'center',
      }}
      data-palette={palette}
    />
  );
}

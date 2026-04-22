import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
  align?: 'left' | 'right' | 'center';
}

interface DataTableProps<T extends { id: string }> {
  columns: Column<T>[];
  rows: T[];
  empty?: ReactNode;
  className?: string;
  onRowClick?: (row: T) => void;
}

/**
 * The single hairline-table used across admin lists. Mirrors DS §7.11.
 */
export function DataTable<T extends { id: string }>({
  columns,
  rows,
  empty,
  className,
  onRowClick,
}: DataTableProps<T>) {
  if (rows.length === 0) {
    return (
      <div className={cn('rounded-[16px] border border-line p-10 text-center text-body-sm text-ink-3', className)}>
        {empty ?? 'Nothing here yet.'}
      </div>
    );
  }
  return (
    <div className={cn('overflow-x-auto rounded-[14px] border border-line bg-surface', className)}>
      <table className="w-full text-[13.5px] border-collapse">
        <thead>
          <tr className="bg-surface-muted text-left">
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  'px-4 py-2.5 text-eyebrow uppercase tracking-[0.12em] text-ink-3 font-semibold',
                  col.align === 'right' && 'text-right',
                  col.align === 'center' && 'text-center',
                  col.className,
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              className={cn(
                'border-t border-line transition-colors duration-120',
                onRowClick && 'hover:bg-surface-muted/40 cursor-pointer',
              )}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={cn(
                    'px-4 py-3 align-middle text-ink-2',
                    col.align === 'right' && 'text-right',
                    col.align === 'center' && 'text-center',
                    col.className,
                  )}
                >
                  {col.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

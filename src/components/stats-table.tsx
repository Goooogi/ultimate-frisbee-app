'use client';

// Reusable sortable stats table.
// Used by /players leaderboard and /teams pages.
// `columns` drives headers; `rows` is generic data.
// Sort state lives in parent (URL params) — this component only renders.

import Link from 'next/link';

export interface StatsColumn {
  key: string;
  label: string;
  /** If true, clicking the header triggers sort. Requires onSort callback. */
  sortable?: boolean;
  /** How to align the cell — defaults to right for numbers. */
  align?: 'left' | 'right' | 'center';
  /** If provided, wraps the cell value in a Link. */
  href?: (row: Record<string, unknown>) => string | null;
  /** Custom render function for the cell value. */
  render?: (value: unknown, row: Record<string, unknown>) => React.ReactNode;
}

interface StatsTableProps {
  columns: StatsColumn[];
  rows: Record<string, unknown>[];
  sortKey?: string;
  sortDir?: 'asc' | 'desc';
  onSort?: (key: string) => void;
  /** Injected as first cell — rank number. Pass undefined to hide. */
  showRank?: boolean;
  emptyMessage?: string;
}

export function StatsTable({
  columns,
  rows,
  sortKey,
  sortDir,
  onSort,
  showRank = false,
  emptyMessage = 'No data found.',
}: StatsTableProps) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 text-center bg-surface border border-border">
        <div className="text-[14px] font-semibold uppercase tracking-[0.18em] text-muted mb-2 font-tight">
          {emptyMessage}
        </div>
      </div>
    );
  }

  const thBase = [
    'px-3 py-2 text-[10px] font-bold tracking-[0.14em] uppercase font-tight text-muted',
    'border-b border-border whitespace-nowrap',
  ].join(' ');

  const tdBase = 'px-3 py-2.5 text-[13px] border-b border-hairline';

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            {showRank && (
              <th className={`${thBase} text-right w-8`} scope="col">
                #
              </th>
            )}
            {columns.map((col) => {
              const isActive = col.key === sortKey;
              const align = col.align ?? (col.key === columns[0].key ? 'left' : 'right');
              const alignClass = align === 'left' ? 'text-left' : align === 'center' ? 'text-center' : 'text-right';

              if (col.sortable && onSort) {
                return (
                  <th key={col.key} scope="col" className={`${thBase} ${alignClass}`}>
                    <button
                      onClick={() => onSort(col.key)}
                      className={[
                        'inline-flex items-center gap-1 cursor-pointer',
                        'hover:text-ink transition-colors duration-150',
                        isActive ? 'text-ink' : '',
                      ].join(' ')}
                      aria-label={`Sort by ${col.label}`}
                    >
                      {col.label}
                      {isActive && (
                        <svg
                          className="w-2.5 h-2.5 flex-shrink-0"
                          viewBox="0 0 10 10"
                          fill="none"
                          aria-hidden="true"
                          style={{ transform: sortDir === 'asc' ? 'scaleY(-1)' : undefined }}
                        >
                          <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </button>
                  </th>
                );
              }

              return (
                <th key={col.key} scope="col" className={`${thBase} ${alignClass}`}>
                  {col.label}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              className="hover:bg-surface-hi transition-colors duration-100"
            >
              {showRank && (
                <td className={`${tdBase} text-right text-faint tabular font-tight`}>
                  {i + 1}
                </td>
              )}
              {columns.map((col) => {
                const value = row[col.key];
                const align = col.align ?? (col.key === columns[0].key ? 'left' : 'right');
                const alignClass = align === 'left' ? 'text-left' : align === 'center' ? 'text-center' : 'text-right';
                const isNumeric = align === 'right';

                const content = col.render
                  ? col.render(value, row)
                  : isNumeric
                  ? <span className="tabular">{value as React.ReactNode ?? '—'}</span>
                  : (value as React.ReactNode ?? '—');

                const href = col.href ? col.href(row) : null;

                return (
                  <td
                    key={col.key}
                    className={`${tdBase} ${alignClass} ${col.key === columns[0].key ? 'text-ink font-medium font-tight' : 'text-muted font-tight'}`}
                  >
                    {href ? (
                      <Link
                        href={href}
                        className="hover:text-ink transition-colors duration-150 underline-offset-2 hover:underline"
                      >
                        {content}
                      </Link>
                    ) : (
                      content
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

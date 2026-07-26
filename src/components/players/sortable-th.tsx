'use client';

// A clickable stat-column header for the /players leaderboard tables. Clicking
// pushes ?sort=<field>&dir=<toggled> (same URL params the SortControl dropdown
// uses), so column-header sorting and the dropdown stay in sync. The active
// column shows a direction arrow; clicking the active column flips the
// direction. Non-sortable columns (Player, Team, #, derived Impact) render a
// plain <th> via the `sortField={null}` path from the caller.

import { useRouter, usePathname, useSearchParams } from 'next/navigation';

export function SortableTh({
  label,
  sortField,
  currentSort,
  currentDir,
  className,
  title,
  accent = false,
  defaultDir = 'desc',
}: {
  label: string;
  /** The ?sort= value this column maps to. */
  sortField: string;
  currentSort: string;
  currentDir: 'asc' | 'desc';
  /** Alignment/width/padding classes for the <th> (matches the sibling headers). */
  className: string;
  title?: string;
  accent?: boolean;
  /** Direction to apply when first activating this column (stats → desc). */
  defaultDir?: 'asc' | 'desc';
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const isActive = currentSort === sortField;
  // Clicking the active column flips direction; a new column starts at defaultDir.
  const nextDir: 'asc' | 'desc' = isActive ? (currentDir === 'desc' ? 'asc' : 'desc') : defaultDir;

  function onClick() {
    const params = new URLSearchParams(searchParams.toString());
    params.set('sort', sortField);
    params.set('dir', nextDir);
    params.delete('page');
    router.push(`${pathname}?${params}`);
  }

  return (
    <th className={className} scope="col" title={title} aria-sort={isActive ? (currentDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        onClick={onClick}
        className={[
          'group/th inline-flex items-center gap-1 cursor-pointer select-none',
          'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-sm',
          // Keep the button flush with the header's alignment (parent <th> aligns).
          accent ? 'text-accent' : isActive ? 'text-ink' : 'text-faint hover:text-ink',
        ].join(' ')}
      >
        {label}
        <Arrow active={isActive} dir={currentDir} />
      </button>
    </th>
  );
}

/** Sort arrow — faint/hidden when inactive, points up (asc) or down (desc). */
function Arrow({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  return (
    <svg
      width="8"
      height="8"
      viewBox="0 0 10 10"
      fill="none"
      aria-hidden="true"
      className={[
        'shrink-0 transition-opacity',
        active ? 'opacity-100' : 'opacity-0 group-hover/th:opacity-40',
      ].join(' ')}
      style={{ transform: active && dir === 'asc' ? 'scaleY(-1)' : undefined }}
    >
      <path d="M5 7L2 3.5h6L5 7z" fill="currentColor" />
    </svg>
  );
}

'use client';

// Sortable UFA team roster table. Extracted from the team [id] page so the
// column headers can drive client-side sorting (by #, name, or any stat).
// Markup + tokens are lifted verbatim from the original server-rendered table
// so the design is unchanged — only the interaction (click-to-sort) is new.
//
// Default order = the server's order (players arrive sorted by scores desc).
// Clicking a header sorts by that column; clicking again flips direction.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { UfaPlayerStat } from '@/lib/ufa/types';

interface Props {
  players: UfaPlayerStat[];
  /** playerID → jersey number (from the latest game roster report). */
  jerseyByPlayer: Map<string, string>;
  year: number;
}

// Sort keys. 'default' = the incoming order (scores desc). '#' sorts by jersey
// (numeric where possible), everything else by the underlying stat.
type SortKey =
  | 'default' | 'jersey' | 'name'
  | 'goals' | 'assists' | 'blocks' | 'drops' | 'cmp' | 'cmpPct' | 'plusMinus';
type SortDir = 'asc' | 'desc';

interface Column {
  label: string;
  title: string;
  left: boolean;
  key: SortKey;
  /** Default direction when a column is first clicked. Stats → desc (best
   *  first); jersey/name → asc. */
  firstDir: SortDir;
}

const COLUMNS: Column[] = [
  { label: '#',    title: 'Jersey number',          left: true,  key: 'jersey',    firstDir: 'asc'  },
  { label: 'Player', title: 'Player',               left: true,  key: 'name',      firstDir: 'asc'  },
  { label: 'G',    title: 'Goals',                  left: false, key: 'goals',     firstDir: 'desc' },
  { label: 'A',    title: 'Assists',                left: false, key: 'assists',   firstDir: 'desc' },
  { label: 'Blk',  title: 'Blocks',                 left: false, key: 'blocks',    firstDir: 'desc' },
  { label: 'D',    title: 'Drops',                  left: false, key: 'drops',     firstDir: 'desc' },
  { label: 'CMP',  title: 'Completions / Attempts', left: false, key: 'cmp',       firstDir: 'desc' },
  { label: 'CMP%', title: 'Completion %',           left: false, key: 'cmpPct',    firstDir: 'desc' },
  { label: '+/−',  title: 'Plus / Minus',           left: false, key: 'plusMinus', firstDir: 'desc' },
];

function formatPlusMinus(val: number | undefined): string {
  if (val == null) return '—';
  return val >= 0 ? `+${val}` : String(val);
}

/** Numeric value used to sort a column (name handled separately as a string). */
function sortValue(p: UfaPlayerStat, key: SortKey, jersey: string | undefined, index: number): number {
  switch (key) {
    case 'jersey': {
      const n = parseInt(jersey ?? '', 10);
      // Players without a real jersey fall to the index-based fallback (i+1),
      // so they still order stably after the numbered ones.
      return Number.isFinite(n) ? n : 1_000_000 + index;
    }
    case 'goals':     return p.goals ?? 0;
    case 'assists':   return p.assists ?? 0;
    case 'blocks':    return p.blocks ?? 0;
    case 'drops':     return p.drops ?? 0;
    case 'cmp':       return p.completions ?? 0;
    case 'cmpPct':    return parseFloat(p.completionPercentage as string) || 0;
    case 'plusMinus': return p.plusMinus ?? 0;
    default:          return 0;
  }
}

export function UfaRosterTable({ players, jerseyByPlayer, year }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('default');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const sorted = useMemo(() => {
    if (sortKey === 'default') return players;
    const withIdx = players.map((p, i) => ({ p, i }));
    withIdx.sort((a, b) => {
      let cmp: number;
      if (sortKey === 'name') {
        cmp = (a.p.name ?? '').localeCompare(b.p.name ?? '');
      } else {
        const av = sortValue(a.p, sortKey, jerseyByPlayer.get(a.p.playerID), a.i);
        const bv = sortValue(b.p, sortKey, jerseyByPlayer.get(b.p.playerID), b.i);
        cmp = av - bv;
      }
      if (cmp === 0) cmp = a.i - b.i; // stable tiebreak = original order
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return withIdx.map((x) => x.p);
  }, [players, jerseyByPlayer, sortKey, sortDir]);

  function onSort(col: Column) {
    if (sortKey === col.key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(col.key);
      setSortDir(col.firstDir);
    }
  }

  return (
    <div className="overflow-x-auto -mx-5 px-5 md:mx-0 md:px-0">
      <table className="w-full min-w-[600px] border-collapse">
        <thead>
          <tr>
            {COLUMNS.map((h) => {
              const active = sortKey === h.key;
              return (
                <th
                  key={h.label}
                  scope="col"
                  title={`${h.title} — click to sort`}
                  aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  className={[
                    'px-3 py-2 text-[10px] font-bold tracking-[0.14em] uppercase font-tight',
                    'border-b border-border whitespace-nowrap select-none cursor-pointer',
                    'transition-colors hover:text-ink focus-visible:outline-none focus-visible:text-ink',
                    active ? 'text-ink' : 'text-muted',
                    h.left ? 'text-left' : 'text-right',
                  ].join(' ')}
                >
                  <button
                    type="button"
                    onClick={() => onSort(h)}
                    className={[
                      'inline-flex items-center gap-1 cursor-pointer bg-transparent',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-sm',
                      h.left ? '' : 'flex-row-reverse',
                    ].join(' ')}
                  >
                    <span>{h.label}</span>
                    <SortCaret active={active} dir={sortDir} />
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((p, i) => {
            const cmp = parseFloat(p.completionPercentage as string) || 0;
            const completions = p.completions ?? 0;
            const attempts = completions + (p.throwaways ?? 0);
            const cmpStr = completions > 0 ? `${completions}/${attempts}` : '—';
            const jersey = jerseyByPlayer.get(p.playerID);
            // Jersey fallback tracks the ORIGINAL order, not the sorted index,
            // so a player's "#" doesn't change as the table is re-sorted.
            const fallbackNum = players.indexOf(p) + 1;
            return (
              <tr key={p.playerID} className="hover:bg-surface-hi transition-colors duration-100">
                <td className="px-3 py-2.5 text-[13px] border-b border-hairline text-left text-faint tabular font-tight">{jersey ?? fallbackNum}</td>
                <td className="px-3 py-2.5 text-[13px] border-b border-hairline text-left text-ink font-medium font-tight">
                  <Link href={`/players/${p.playerID}?from=ufa`} className="hover:text-accent transition-colors duration-150">
                    {p.name}
                  </Link>
                </td>
                <td className="px-3 py-2.5 text-[13px] border-b border-hairline text-right tabular text-muted font-tight">{p.goals ?? '—'}</td>
                <td className="px-3 py-2.5 text-[13px] border-b border-hairline text-right tabular text-muted font-tight">{p.assists ?? '—'}</td>
                <td className="px-3 py-2.5 text-[13px] border-b border-hairline text-right tabular text-muted font-tight">{p.blocks ?? '—'}</td>
                <td className="px-3 py-2.5 text-[13px] border-b border-hairline text-right tabular text-muted font-tight">{p.drops ?? '—'}</td>
                <td className="px-3 py-2.5 text-[13px] border-b border-hairline text-right tabular text-muted font-tight">{cmpStr}</td>
                <td className="px-3 py-2.5 text-[13px] border-b border-hairline text-right tabular text-muted font-tight">
                  {cmp > 0 ? `${cmp.toFixed(1)}%` : '—'}
                </td>
                <td className="px-3 py-2.5 text-[13px] border-b border-hairline text-right tabular text-muted font-tight">{formatPlusMinus(p.plusMinus)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Up/down caret. Faint + neutral until its column is active. */
function SortCaret({ active, dir }: { active: boolean; dir: SortDir }) {
  return (
    <svg
      width="8" height="8" viewBox="0 0 8 8" aria-hidden="true"
      className={active ? 'text-accent' : 'text-faint/50'}
    >
      {active && dir === 'asc' ? (
        <path d="M4 1.5L7 6H1z" fill="currentColor" />
      ) : active ? (
        <path d="M4 6.5L1 2h6z" fill="currentColor" />
      ) : (
        // Inactive: a small neutral up/down hint.
        <path d="M4 0.8L6 3H2zM4 7.2L2 5h4z" fill="currentColor" />
      )}
    </svg>
  );
}

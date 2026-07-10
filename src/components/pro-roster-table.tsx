'use client';

// Shared sortable roster table for PUL + WUL team pages. Both leagues expose an
// identical stat set (#, Player, G, A, Blk, TO, O-Pts, D-Pts, +/−) and matching
// PulPlayer/WulPlayer field names, so one client component serves both — the
// only difference is the player link, so callers pass a `league` used to build
// the /players/[id]?from=<league> href. Markup/tokens lifted verbatim from the
// original server tables; only the click-to-sort interaction is new. Mirrors
// ufa-roster-table.tsx.

import { useMemo, useState } from 'react';
import Link from 'next/link';

/** Structural shape both PulPlayer and WulPlayer satisfy (only the fields we
 *  read). Keeps this component free of a hard dependency on either data layer. */
export interface ProRosterPlayer {
  id: string;
  playerName: string;
  jerseyNumber: string;
  goals: number;
  assists: number;
  blocks: number;
  turnovers: number;
  oPoints: number;
  dPoints: number;
  plusMinus: number;
}

type SortKey =
  | 'default' | 'jersey' | 'name'
  | 'goals' | 'assists' | 'blocks' | 'turnovers' | 'oPoints' | 'dPoints' | 'plusMinus';
type SortDir = 'asc' | 'desc';

interface Column {
  label: string;
  title: string;
  left: boolean;
  key: SortKey;
  firstDir: SortDir;
}

const COLUMNS: Column[] = [
  { label: '#',      title: 'Jersey number',           left: true,  key: 'jersey',    firstDir: 'asc'  },
  { label: 'Player', title: 'Player name',             left: true,  key: 'name',      firstDir: 'asc'  },
  { label: 'G',      title: 'Goals',                   left: false, key: 'goals',     firstDir: 'desc' },
  { label: 'A',      title: 'Assists',                 left: false, key: 'assists',   firstDir: 'desc' },
  { label: 'Blk',    title: 'Blocks',                  left: false, key: 'blocks',    firstDir: 'desc' },
  { label: 'TO',     title: 'Turnovers',               left: false, key: 'turnovers', firstDir: 'desc' },
  { label: 'O-Pts',  title: 'Offensive Points Played', left: false, key: 'oPoints',   firstDir: 'desc' },
  { label: 'D-Pts',  title: 'Defensive Points Played', left: false, key: 'dPoints',   firstDir: 'desc' },
  { label: '+/−',    title: 'Plus / Minus',            left: false, key: 'plusMinus', firstDir: 'desc' },
];

function formatPlusMinus(val: number): string {
  return val > 0 ? `+${val}` : String(val);
}

function sortValue(p: ProRosterPlayer, key: SortKey, index: number): number {
  switch (key) {
    case 'jersey': {
      const n = parseInt(p.jerseyNumber ?? '', 10);
      return Number.isFinite(n) ? n : 1_000_000 + index;
    }
    case 'goals':     return p.goals ?? 0;
    case 'assists':   return p.assists ?? 0;
    case 'blocks':    return p.blocks ?? 0;
    case 'turnovers': return p.turnovers ?? 0;
    case 'oPoints':   return p.oPoints ?? 0;
    case 'dPoints':   return p.dPoints ?? 0;
    case 'plusMinus': return p.plusMinus ?? 0;
    default:          return 0;
  }
}

interface Props {
  players: ProRosterPlayer[];
  /** Drives the player-profile link: /players/[id]?from=<league>. */
  league: 'pul' | 'wul';
  /** WUL links player names to their profile; PUL historically does not. */
  linkNames?: boolean;
  minWidth?: number;
}

export function ProRosterTable({ players, league, linkNames = true, minWidth = 620 }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('default');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const sorted = useMemo(() => {
    if (sortKey === 'default') return players;
    const withIdx = players.map((p, i) => ({ p, i }));
    withIdx.sort((a, b) => {
      let cmp: number;
      if (sortKey === 'name') {
        cmp = (a.p.playerName ?? '').localeCompare(b.p.playerName ?? '');
      } else {
        cmp = sortValue(a.p, sortKey, a.i) - sortValue(b.p, sortKey, b.i);
      }
      if (cmp === 0) cmp = a.i - b.i;
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return withIdx.map((x) => x.p);
  }, [players, sortKey, sortDir]);

  function onSort(col: Column) {
    if (sortKey === col.key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(col.key);
      setSortDir(col.firstDir);
    }
  }

  return (
    <div className="overflow-x-auto bg-surface rounded-card-lg shadow-card">
      <table className="w-full border-collapse" style={{ minWidth }}>
        <thead>
          <tr>
            {COLUMNS.map((h, hi) => {
              const active = sortKey === h.key;
              return (
                <th
                  key={h.label}
                  scope="col"
                  title={`${h.title} — click to sort`}
                  aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  className={[
                    'px-3 py-3 text-[10px] font-bold tracking-wide uppercase',
                    'whitespace-nowrap select-none cursor-pointer',
                    'transition-colors hover:text-ink',
                    active ? 'text-ink' : 'text-faint',
                    h.left ? 'text-left' : 'text-right',
                    hi === 0 ? 'pl-5' : '',
                    hi === COLUMNS.length - 1 ? 'pr-5' : '',
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
          {sorted.map((player, i) => {
            const rowTop = i === 0 ? '' : 'border-t border-hairline';
            return (
              <tr key={player.id} className="hover:bg-surface-hi transition-colors duration-100">
                <td className={`px-3 py-2.5 text-[13px] text-left text-faint tabular font-tight pl-5 ${rowTop}`}>
                  {player.jerseyNumber || '—'}
                </td>
                <td className={`px-3 py-2.5 text-[13px] text-left text-ink font-medium font-tight ${rowTop}`}>
                  {linkNames ? (
                    <Link href={`/players/${player.id}?from=${league}`} className="hover:text-accent transition-colors duration-150">
                      {player.playerName}
                    </Link>
                  ) : (
                    player.playerName
                  )}
                </td>
                <td className={`px-3 py-2.5 text-[13px] text-right tabular text-muted font-tight ${rowTop}`}>{player.goals}</td>
                <td className={`px-3 py-2.5 text-[13px] text-right tabular text-muted font-tight ${rowTop}`}>{player.assists}</td>
                <td className={`px-3 py-2.5 text-[13px] text-right tabular text-muted font-tight ${rowTop}`}>{player.blocks}</td>
                <td className={`px-3 py-2.5 text-[13px] text-right tabular text-muted font-tight ${rowTop}`}>{player.turnovers}</td>
                <td className={`px-3 py-2.5 text-[13px] text-right tabular text-muted font-tight ${rowTop}`}>{player.oPoints}</td>
                <td className={`px-3 py-2.5 text-[13px] text-right tabular text-muted font-tight ${rowTop}`}>{player.dPoints}</td>
                <td className={`px-3 py-2.5 text-[13px] text-right tabular text-muted font-tight pr-5 ${rowTop}`}>{formatPlusMinus(player.plusMinus)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SortCaret({ active, dir }: { active: boolean; dir: SortDir }) {
  return (
    <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true" className={active ? 'text-accent' : 'text-faint/50'}>
      {active && dir === 'asc' ? (
        <path d="M4 1.5L7 6H1z" fill="currentColor" />
      ) : active ? (
        <path d="M4 6.5L1 2h6z" fill="currentColor" />
      ) : (
        <path d="M4 0.8L6 3H2zM4 7.2L2 5h4z" fill="currentColor" />
      )}
    </svg>
  );
}

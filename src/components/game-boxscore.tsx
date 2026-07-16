'use client';

// Per-player game breakdown for a single game.
//
// Auto-loads on mount (no toggle): the section always shows top 7 by points
// played for each team side-by-side. "Show all" expands to the full tables.
//
// Why a separate API call instead of server-rendering: the UFA API has no
// "all players for one game" endpoint, so we fan out to
// /web-v1/roster-game-stats-for-player for each rostered player on both sides
// (~70 fetches). Doing this in the page handler would slow first paint of the
// game page; running it as a parallel client fetch keeps the score/leaders
// visible immediately while the breakdown streams in.
//
// Caching: the /api/game-boxscore/[id] route caches the composed payload for
// 5min, and each per-player game log is independently cached for 1h. So warm
// calls return in ~200ms.

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { TeamMeta } from '@/lib/ufa/teams';
import type {
  UfaBoxscorePlayerRow,
  UfaGameBoxscore,
  UfaPlayerGameRow,
} from '@/lib/ufa/types';
import { useTheme } from '@/lib/use-theme';

interface GameBoxscoreProps {
  gameID: string;
  away: TeamMeta;
  home: TeamMeta;
  awayName: string;
  homeName: string;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; data: UfaGameBoxscore }
  | { kind: 'error'; message: string };

const TOP_N = 7;

export function GameBoxscore({ gameID, away, home, awayName, homeName }: GameBoxscoreProps) {
  const [theme] = useTheme();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [showAll, setShowAll] = useState(false);

  // Refs survive across React 18 strict-mode double-invokes; closure-captured
  // booleans don't (cleanup from the first invoke would flip them and discard
  // the response when it eventually resolves).
  const activeGameRef = useRef<string | null>(null);

  useEffect(() => {
    if (activeGameRef.current === gameID) return;
    activeGameRef.current = gameID;

    setState({ kind: 'loading' });

    fetch(`/api/game-boxscore/${encodeURIComponent(gameID)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as UfaGameBoxscore;
      })
      .then((data) => {
        // Only apply if we're still showing this game.
        if (activeGameRef.current === gameID) setState({ kind: 'ready', data });
      })
      .catch((err) => {
        if (activeGameRef.current === gameID) {
          setState({
            kind: 'error',
            message: err instanceof Error ? err.message : 'Failed to load',
          });
        }
      });
  }, [gameID]);

  const isBcast = theme === 'broadcast';

  return (
    <section aria-labelledby="boxscore-heading" className="py-6 md:py-8">
      <h2
        id="boxscore-heading"
        className={[
          'pb-2 mb-5 border-b flex items-baseline justify-between',
          isBcast
            ? 'font-sans text-[10px] font-bold tracking-[0.22em] uppercase text-muted border-hairline'
            : 'text-[10px] font-bold tracking-[0.18em] uppercase text-muted font-tight border-hairline',
        ].join(' ')}
      >
        <span>Player breakdown · this game</span>
        <span className="text-faint">Top {TOP_N} per side by points played</span>
      </h2>

      {state.kind === 'loading' && <LoadingSkeleton isBcast={isBcast} />}

      {state.kind === 'error' && (
        <div className={`text-[12px] ${isBcast ? 'font-sans' : 'font-tight'} text-muted`}>
          Could not load breakdown — {state.message}.
        </div>
      )}

      {state.kind === 'ready' && (
        <Boxscore
          data={state.data}
          away={away}
          home={home}
          awayName={awayName}
          homeName={homeName}
          isBcast={isBcast}
          showAll={showAll}
          onToggleShowAll={() => setShowAll((v) => !v)}
        />
      )}
    </section>
  );
}

function Boxscore({
  data,
  away,
  home,
  awayName,
  homeName,
  isBcast,
  showAll,
  onToggleShowAll,
}: {
  data: UfaGameBoxscore;
  away: TeamMeta;
  home: TeamMeta;
  awayName: string;
  homeName: string;
  isBcast: boolean;
  showAll: boolean;
  onToggleShowAll: () => void;
}) {
  const awayActive = sortByPP(data.away.filter(hasPlayed));
  const homeActive = sortByPP(data.home.filter(hasPlayed));

  const awayShown = showAll ? awayActive : awayActive.slice(0, TOP_N);
  const homeShown = showAll ? homeActive : homeActive.slice(0, TOP_N);

  const hiddenAway = Math.max(0, awayActive.length - TOP_N);
  const hiddenHome = Math.max(0, homeActive.length - TOP_N);
  const totalHidden = hiddenAway + hiddenHome;

  const awayDnp = data.away.length - awayActive.length;
  const homeDnp = data.home.length - homeActive.length;

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6">
        <SidePanel
          side="Away"
          team={away}
          teamName={awayName}
          rows={awayShown}
          dnp={awayDnp}
          isBcast={isBcast}
          showAll={showAll}
        />
        <SidePanel
          side="Home"
          team={home}
          teamName={homeName}
          rows={homeShown}
          dnp={homeDnp}
          isBcast={isBcast}
          showAll={showAll}
        />
      </div>

      {totalHidden > 0 && (
        <div className="mt-5 flex justify-center">
          <button
            type="button"
            onClick={onToggleShowAll}
            aria-expanded={showAll}
            className={[
              'group inline-flex items-center gap-2 px-4 py-2.5 cursor-pointer rounded-full bg-ink/5 transition-colors duration-150',
              'hover:bg-ink/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
              isBcast
                ? 'font-sans text-[10px] font-bold tracking-[0.22em] uppercase text-muted hover:text-ink'
                : 'font-tight text-[10px] font-bold tracking-[0.18em] uppercase text-muted hover:text-ink',
            ].join(' ')}
          >
            {showAll ? `Show top ${TOP_N} only` : `Show all ${totalHidden} more`}
            <Chevron open={showAll} />
          </button>
        </div>
      )}
    </>
  );
}

function SidePanel({
  side,
  team,
  teamName,
  rows,
  dnp,
  isBcast,
  showAll,
}: {
  side: 'Away' | 'Home';
  team: TeamMeta;
  teamName: string;
  rows: UfaBoxscorePlayerRow[];
  dnp: number;
  isBcast: boolean;
  showAll: boolean;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2.5">
        <span
          className={`flex-shrink-0 ${isBcast ? 'w-2 h-7' : 'w-1.5 h-5'}`}
          style={{ background: team.primary }}
          aria-hidden="true"
        />
        <div className="flex flex-col min-w-0">
          <span
            className={`text-[9px] font-bold tracking-[0.18em] uppercase text-faint ${
              isBcast ? 'font-sans' : 'font-tight'
            }`}
          >
            {side} · {team.abbr}
          </span>
          <h3
            className={
              isBcast
                ? 'font-display text-[15px] md:text-[18px] font-bold uppercase text-ink tracking-[0.02em] leading-tight'
                : 'text-[13px] md:text-[14px] font-bold text-ink font-tight tracking-[-0.01em] leading-tight'
            }
          >
            {teamName}
          </h3>
        </div>
      </div>

      <div className="overflow-x-auto -mx-1 px-1">
        <table className="w-full border-collapse">
          <thead>
            <tr
              className={`text-[9px] font-bold tracking-[0.14em] uppercase text-faint ${
                isBcast ? 'font-sans' : 'font-tight'
              }`}
            >
              <Th align="left">Player</Th>
              <Th title="Points played (O + D)">PP</Th>
              <Th>G</Th>
              <Th>A</Th>
              <Th>Bk</Th>
              <Th title="Plus / minus">+/-</Th>
              {showAll && (
                <>
                  <Th title="2nd assists">2A</Th>
                  <Th title="Completions / attempts">Cmp</Th>
                  <Th title="Throwaways">TO</Th>
                  <Th>D</Th>
                  <Th title="Yards thrown / received">Yds</Th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <PlayerRow key={r.playerID} row={r} isBcast={isBcast} showAll={showAll} />
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={showAll ? 11 : 6} className="py-4 text-center text-[12px] text-faint">
                  No player data yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {dnp > 0 && (
        <div className={`mt-2 text-[10px] font-medium text-faint ${isBcast ? 'font-sans' : 'font-tight'}`}>
          {dnp} did not play
        </div>
      )}
    </div>
  );
}

function Th({
  children,
  align = 'right',
  title,
}: {
  children: React.ReactNode;
  align?: 'left' | 'right';
  title?: string;
}) {
  return (
    <th
      scope="col"
      title={title}
      className={`py-2 ${align === 'left' ? 'text-left pl-1.5 pr-2' : 'text-right px-1.5 md:px-2'} border-b border-hairline`}
    >
      {children}
    </th>
  );
}

function PlayerRow({
  row,
  isBcast,
  showAll,
}: {
  row: UfaBoxscorePlayerRow;
  isBcast: boolean;
  showAll: boolean;
}) {
  const s = row.stats;
  const plusMinus = s ? plusMinusOf(s) : 0;
  const pp = s ? pointsPlayed(s) : 0;

  return (
    <tr
      className={`border-b border-hairline last:border-b-0 hover:bg-surface/80 transition-colors text-[12px] md:text-[13px] tabular ${
        isBcast ? 'font-sans' : 'font-tight'
      }`}
    >
      <td className="py-2 pl-1.5 pr-2 text-left">
        <Link
          href={`/players/${row.playerID}?from=ufa`}
          className="font-semibold text-ink hover:text-accent transition-colors focus-visible:outline-none focus-visible:underline"
        >
          {row.firstName} {row.lastName}
        </Link>
        {row.jerseyNumber != null && row.jerseyNumber !== '' && (
          <span className="ml-1.5 text-[10px] font-bold text-faint">#{row.jerseyNumber}</span>
        )}
      </td>
      <Td value={pp || null} emphasized={pp > 0} />
      <Td value={s?.goals} />
      <Td value={s?.assists} />
      <Td value={s?.blocks} />
      <Td
        value={s ? (plusMinus > 0 ? `+${plusMinus}` : String(plusMinus)) : null}
        emphasized={s != null && plusMinus !== 0}
        positive={plusMinus > 0}
      />
      {showAll && (
        <>
          <Td value={s?.hockeyAssists} subdued />
          <Td value={s ? `${s.completions}/${s.throwsAttempted}` : null} subdued small />
          <Td value={s?.throwaways} subdued />
          <Td value={s?.drops} subdued />
          <Td value={s ? `${s.yardsThrown}/${s.yardsReceived}` : null} subdued small />
        </>
      )}
    </tr>
  );
}

function Td({
  value,
  subdued,
  emphasized,
  positive,
  small,
}: {
  value: number | string | null | undefined;
  subdued?: boolean;
  emphasized?: boolean;
  positive?: boolean;
  small?: boolean;
}) {
  const empty = value == null || value === 0 || value === '0';
  const cls = [
    'py-2 px-1.5 md:px-2 text-right tabular',
    small ? 'text-[11px] md:text-[12px]' : '',
    empty
      ? 'text-faint'
      : emphasized
        ? positive
          ? 'text-accent font-bold'
          : 'text-ink font-bold'
        : subdued
          ? 'text-muted'
          : 'text-ink font-semibold',
  ]
    .filter(Boolean)
    .join(' ');
  return <td className={cls}>{empty ? '—' : value}</td>;
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 150ms' }}
    >
      <path d="M2 4l3 3 3-3" />
    </svg>
  );
}

function LoadingSkeleton({ isBcast }: { isBcast: boolean }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6">
      {[0, 1].map((i) => (
        <div key={i} className="flex flex-col gap-2">
          <div className="flex items-center gap-2 mb-1">
            <span className={`bg-hairline animate-pulse ${isBcast ? 'w-2 h-7' : 'w-1.5 h-5'}`} aria-hidden="true" />
            <div className="flex flex-col gap-1">
              <div className="h-2 w-16 bg-hairline animate-pulse rounded-sm" />
              <div className="h-3 w-28 bg-hairline animate-pulse rounded-sm" />
            </div>
          </div>
          {[0, 1, 2, 3, 4, 5, 6].map((j) => (
            <div key={j} className="h-7 bg-hairline/60 animate-pulse rounded-sm" />
          ))}
        </div>
      ))}
    </div>
  );
}

// ── helpers ─────────────────────────────────────────────────────────────────

function pointsPlayed(s: UfaPlayerGameRow): number {
  return s.oPointsPlayed + s.dPointsPlayed;
}

function plusMinusOf(s: UfaPlayerGameRow): number {
  return s.goals + s.assists + s.blocks - s.throwaways - s.drops;
}

function hasPlayed(r: UfaBoxscorePlayerRow): boolean {
  return r.stats != null && pointsPlayed(r.stats) > 0;
}

function sortByPP(rows: UfaBoxscorePlayerRow[]): UfaBoxscorePlayerRow[] {
  return [...rows].sort((a, b) => {
    const ap = a.stats ? pointsPlayed(a.stats) : 0;
    const bp = b.stats ? pointsPlayed(b.stats) : 0;
    if (ap !== bp) return bp - ap;
    // Tiebreak by plus/minus, then by goals + assists.
    const ax = a.stats ? plusMinusOf(a.stats) : 0;
    const bx = b.stats ? plusMinusOf(b.stats) : 0;
    if (ax !== bx) return bx - ax;
    const ay = a.stats ? a.stats.goals + a.stats.assists : 0;
    const by = b.stats ? b.stats.goals + b.stats.assists : 0;
    return by - ay;
  });
}

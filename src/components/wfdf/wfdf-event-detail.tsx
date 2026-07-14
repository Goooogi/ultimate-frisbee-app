'use client';

// WFDF event detail — division tabs → standings + games for one Worlds event.
//
// WFDF divisions are per-event and named freely (Master Mixed, Open, Women's…),
// so unlike USAU we tab locally rather than via a global ?div param. Each tab
// shows: final standings (from wfdf_teams) + the division's games grouped into
// pool play and bracket. Team names link to /wfdf/teams/[id].

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { WfdfEventDetail as WfdfEvent } from '@/lib/wfdf/data';
import { WfdfFlag } from './wfdf-flag';
import { WfdfBracketTree, hasWfdfBracket } from './wfdf-bracket-tree';

interface Props {
  event: WfdfEvent;
}

export function WfdfEventDetail({ event }: Props) {
  const divisions = event.divisions;
  const [activeDiv, setActiveDiv] = useState<string>(divisions[0]?.name ?? '');

  const teams = useMemo(
    () => event.teams.filter((t) => t.divisionName === activeDiv),
    [event.teams, activeDiv],
  );
  const games = useMemo(
    () => event.games.filter((g) => g.divisionName === activeDiv),
    [event.games, activeDiv],
  );

  // Standings order:
  //  1. final_standing when the source provides it (modern events do; legacy
  //     Ultiorganizer events — e.g. WUC 2024 — leave it null for every team).
  //  2. Otherwise fall back to RECORD: win% desc → more wins → fewer losses.
  //     Without this, null-standing teams sorted alphabetically, which put a
  //     9-0 USA at the BOTTOM. Record is the meaningful ranking when there's no
  //     official final placement.
  //  3. Name as the final tie-break.
  // Whether the source gave us official final placements (modern events) or we
  // must rank by record (legacy pool-only events).
  const hasOfficialStanding = useMemo(() => teams.some((t) => t.finalStanding != null), [teams]);

  const standings = useMemo(() => {
    const anyStanding = hasOfficialStanding;
    const winPct = (t: (typeof teams)[number]) => {
      const w = t.wins ?? 0;
      const l = t.losses ?? 0;
      return w + l > 0 ? w / (w + l) : -1; // teams with no games sink below 0-x
    };
    return [...teams].sort((a, b) => {
      if (anyStanding) {
        const d = (a.finalStanding ?? 999) - (b.finalStanding ?? 999);
        if (d !== 0) return d;
      }
      const pd = winPct(b) - winPct(a);
      if (pd !== 0) return pd;
      const wd = (b.wins ?? 0) - (a.wins ?? 0);
      if (wd !== 0) return wd;
      const ld = (a.losses ?? 0) - (b.losses ?? 0);
      if (ld !== 0) return ld;
      return a.name.localeCompare(b.name);
    });
  }, [teams, hasOfficialStanding]);

  const poolGames = useMemo(() => games.filter((g) => !g.isBracket), [games]);
  const bracketGames = useMemo(() => games.filter((g) => g.isBracket), [games]);
  const hasBracketTree = useMemo(
    () => hasWfdfBracket(activeDiv, event.games, event.teams),
    [activeDiv, event.games, event.teams],
  );

  if (divisions.length === 0) {
    return <p className="text-muted font-tight text-[13px]">No divisions found for this event.</p>;
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Division filter — a native <select> (accessible, mobile-native picker,
          zero-JS) dressed as a proper filter control. WMUCC has up to 9
          divisions, so a dropdown reads cleaner than a wrapping tab row. The
          whole control is one bordered pill: a small "Division" eyebrow, the
          selected value, and a chevron; hover/focus light up the border +
          surface. group-focus-within drives the accent treatment on the chevron
          so keyboard focus is obvious. */}
      <div
        className={[
          'group relative inline-flex items-center gap-2 self-start',
          'h-10 pl-4 pr-3.5 rounded-full',
          'bg-surface shadow-soft',
          'transition-shadow duration-150',
          'hover:shadow-card',
          'focus-within:ring-2 focus-within:ring-accent/40',
        ].join(' ')}
      >
        <label
          htmlFor="wfdf-division-select"
          className="text-[9px] font-bold tracking-[0.16em] uppercase text-faint font-tight flex-shrink-0 pointer-events-none select-none"
        >
          Division
        </label>
        <span className="w-px h-4 bg-hairline flex-shrink-0" aria-hidden="true" />

        {/* The real <select> is transparent + stretched to fill the pill so the
            entire control is the click/tap target; the value text sits on top. */}
        <span className="relative flex items-center">
          <select
            id="wfdf-division-select"
            value={activeDiv}
            onChange={(e) => setActiveDiv(e.target.value)}
            aria-label="Filter by division"
            className={[
              'appearance-none cursor-pointer bg-transparent border-0 outline-none',
              'pr-6 py-1.5',
              'text-[12px] font-bold tracking-[0.04em] uppercase font-tight text-ink',
              'focus:outline-none',
            ].join(' ')}
          >
            {divisions.map((d) => (
              <option key={d.id} value={d.name} className="normal-case tracking-normal text-ink bg-bg">
                {d.name}
              </option>
            ))}
          </select>
          {/* Chevron — accent when the control is focused (keyboard), muted at
              rest, ink on hover. pointer-events-none so it never blocks clicks. */}
          <svg
            className={[
              'pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 w-3 h-3',
              'text-muted group-hover:text-ink group-focus-within:text-accent',
              'transition-colors duration-150',
            ].join(' ')}
            viewBox="0 0 10 10"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M2 3.5L5 6.5L8 3.5"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </div>

      {/* Bracket trees lead — people prefer the visual over the table.
          Championship + placement brackets, each a left-to-right tree with a
          final-placement rail. Reconstructed for modern events that carry
          round-labeled playoff games; renders nothing for divisions with no
          derivable bracket (legacy events, pool-only) — the flat list below is
          the fallback there. */}
      <WfdfBracketTree divisionName={activeDiv} games={event.games} teams={event.teams} />

      {/* Fallback flat bracket-games list — only when the tree couldn't render
          (e.g. legacy events with no round labels). Modern events show the
          trees above and skip this. */}
      {!hasBracketTree && bracketGames.length > 0 && (
        <GameSection heading="Bracket Games" games={bracketGames} />
      )}

      {/* Final Standings — collapsible. Collapsed by default WHEN a bracket
          leads (the bracket is then the primary view). But when this division
          has NO bracket at all (e.g. legacy pool-only events like WUC 2024
          Open), the standings ARE the primary view, so open them by default.
          key forces the <details> back to its default state when the division
          changes, so it doesn't carry an open/closed state across divisions. */}
      <details
        key={`standings-${activeDiv}`}
        className="group"
        open={!hasBracketTree && bracketGames.length === 0}
      >
        <summary
          className={[
            'flex items-center gap-2 cursor-pointer list-none [&::-webkit-details-marker]:hidden',
            'text-[10px] font-bold tracking-[0.18em] uppercase text-muted font-tight',
            'pb-2 border-b border-hairline',
            'hover:text-ink transition-colors duration-150',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-sm',
          ].join(' ')}
        >
          {/* Disclosure chevron — rotates when open. */}
          <svg
            className="w-2.5 h-2.5 flex-shrink-0 transition-transform duration-150 group-open:rotate-90"
            viewBox="0 0 10 10"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M3.5 2L6.5 5L3.5 8"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {hasOfficialStanding ? 'Final Standings' : 'Standings · By Record'}
          <span className="text-faint tabular ml-1">{standings.length}</span>
        </summary>

        <div className="mt-3 bg-surface rounded-card-lg shadow-card overflow-hidden">
          <div className="hidden sm:grid grid-cols-[2.5rem_1fr_5rem_4rem] items-center px-4 py-2.5 border-b border-hairline text-[10px] font-bold tracking-[0.16em] uppercase text-faint font-tight">
            <span>#</span>
            <span>Team</span>
            <span className="text-right">W–L</span>
            <span className="text-right">SOTG</span>
          </div>
          <ol>
            {standings.map((t, i) => (
              <li key={t.id}>
                <Link
                  href={`/wfdf/teams/${t.id}`}
                  className={[
                    'grid grid-cols-[2.5rem_1fr_auto] sm:grid-cols-[2.5rem_1fr_5rem_4rem] items-center px-4 py-3',
                    'no-underline transition-colors duration-150 hover:bg-surface-hi',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent',
                    i > 0 ? 'border-t border-hairline' : '',
                  ].join(' ')}
                >
                  {/* Rank: the official final standing when present; otherwise
                      the positional rank by record (i + 1) — never a bare "—"
                      that would make every legacy-event row look unranked. */}
                  {(() => {
                    const rank = t.finalStanding ?? i + 1;
                    return (
                      <span
                        className={[
                          'font-tight text-[13px] font-bold tabular',
                          rank <= 3 ? 'text-accent' : 'text-faint',
                        ].join(' ')}
                      >
                        {rank}
                      </span>
                    );
                  })()}
                  <span className="min-w-0 flex items-center gap-2">
                    <WfdfFlag flagFile={t.flagFile} countryCode={t.countryCode} size={16} />
                    <span className="font-tight text-[14px] font-semibold text-ink truncate">
                      {t.name}
                    </span>
                  </span>
                  <span className="font-tight text-[13px] tabular text-right text-muted">
                    {t.wins ?? '—'}–{t.losses ?? '—'}
                  </span>
                  <span className="hidden sm:block font-tight text-[13px] tabular text-right text-faint">
                    {t.spiritAvg != null ? t.spiritAvg.toFixed(1) : '—'}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </div>
      </details>

      {/* Pool games */}
      {poolGames.length > 0 && (
        <GameSection heading="Pool Play" games={poolGames} groupByPool />
      )}
    </div>
  );
}

// ─── Games ────────────────────────────────────────────────────────────────────

type Game = WfdfEvent['games'][number];

function GameSection({
  heading,
  games,
  groupByPool = false,
}: {
  heading: string;
  games: Game[];
  groupByPool?: boolean;
}) {
  const groups = useMemo(() => {
    if (!groupByPool) return [{ label: null as string | null, games }];
    const byPool = new Map<string, Game[]>();
    for (const g of games) {
      const k = g.poolName ?? 'Other';
      if (!byPool.has(k)) byPool.set(k, []);
      byPool.get(k)!.push(g);
    }
    return [...byPool.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([label, gs]) => ({ label, games: gs }));
  }, [games, groupByPool]);

  return (
    <section>
      <h2 className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted font-tight mb-3 pb-2 border-b border-hairline">
        {heading}
      </h2>
      <div className="flex flex-col gap-5">
        {groups.map((grp, gi) => (
          <div key={grp.label ?? gi}>
            {grp.label && (
              <div className="text-[10px] font-bold tracking-[0.16em] uppercase text-faint font-tight mb-2">
                {grp.label}
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {grp.games.map((g) => (
                <GameRow key={g.id} game={g} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function GameRow({ game: g }: { game: Game }) {
  const done = g.status === 'completed' && g.homeScore != null && g.awayScore != null;
  const homeWon = done && (g.homeScore ?? 0) > (g.awayScore ?? 0);
  const awayWon = done && (g.awayScore ?? 0) > (g.homeScore ?? 0);
  // WFDF records a single spirit-of-the-game score per game (in away_sotg);
  // there is no separate home value in the source, so we show it once.
  const sotg = g.awaySotg ?? g.homeSotg;
  const timeLabel = formatGameTime(g.scheduledAt);
  const hasFooter = timeLabel != null || sotg != null || (!done && g.status === 'scheduled');
  return (
    <div className="bg-surface rounded-card shadow-card px-3 py-2.5">
      <TeamLine
        name={g.homeTeam}
        teamId={g.homeTeamId}
        country={g.homeCountry}
        score={g.homeScore}
        won={homeWon}
        done={done}
      />
      <div className="h-px bg-hairline my-1" />
      <TeamLine
        name={g.awayTeam}
        teamId={g.awayTeamId}
        country={g.awayCountry}
        score={g.awayScore}
        won={awayWon}
        done={done}
      />
      {hasFooter && (
        <div className="flex items-center justify-between gap-2 mt-1.5 pt-1.5 border-t border-hairline text-[10px] font-tight text-faint">
          <span className="truncate">
            {timeLabel ?? (g.status === 'scheduled' ? 'Scheduled' : '')}
          </span>
          {sotg != null && (
            <span className="tabular flex-shrink-0" title="Spirit of the Game">
              SOTG {sotg}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// Format a scheduled_at ISO timestamp as a compact "Mon 28 · 10:30" label in
// UTC (the source times are venue-local stored as UTC). Returns null if absent.
function formatGameTime(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const day = d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', timeZone: 'UTC' });
  const time = d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  });
  return `${day} · ${time}`;
}

function TeamLine({
  name,
  teamId,
  country,
  score,
  won,
  done,
}: {
  name: string | null;
  teamId: string | null;
  country: string | null;
  score: number | null;
  won: boolean;
  done: boolean;
}) {
  const label = (
    <span className="flex items-center gap-2 min-w-0">
      <WfdfFlag flagFile={null} countryCode={country} size={14} />
      <span
        className={[
          'font-tight text-[13px] truncate',
          done ? (won ? 'font-bold text-ink' : 'text-muted') : 'text-ink',
        ].join(' ')}
      >
        {name ?? 'TBD'}
      </span>
    </span>
  );
  return (
    <div className="flex items-center justify-between gap-2">
      {teamId ? (
        <Link href={`/wfdf/teams/${teamId}`} className="min-w-0 no-underline hover:text-accent">
          {label}
        </Link>
      ) : (
        label
      )}
      <span
        className={[
          'font-tight text-[14px] tabular flex-shrink-0',
          done ? (won ? 'font-bold text-ink' : 'text-muted') : 'text-faint',
        ].join(' ')}
      >
        {score ?? '–'}
      </span>
    </div>
  );
}

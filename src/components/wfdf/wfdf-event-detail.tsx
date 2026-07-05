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

  const standings = useMemo(
    () =>
      [...teams].sort(
        (a, b) => (a.finalStanding ?? 999) - (b.finalStanding ?? 999) || a.name.localeCompare(b.name),
      ),
    [teams],
  );

  const poolGames = useMemo(() => games.filter((g) => !g.isBracket), [games]);
  const bracketGames = useMemo(() => games.filter((g) => g.isBracket), [games]);

  if (divisions.length === 0) {
    return <p className="text-muted font-tight text-[13px]">No divisions found for this event.</p>;
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Division tabs */}
      <div className="flex flex-wrap gap-1.5 -mb-2">
        {divisions.map((d) => {
          const active = d.name === activeDiv;
          return (
            <button
              key={d.id}
              type="button"
              onClick={() => setActiveDiv(d.name)}
              className={[
                'px-3 py-2 rounded-md text-[11px] font-bold tracking-[0.1em] uppercase font-tight',
                'border transition-colors duration-150 cursor-pointer',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                active
                  ? 'bg-ink text-bg border-ink'
                  : 'bg-surface text-muted border-border hover:text-ink hover:border-ink',
              ].join(' ')}
            >
              {d.name}
            </button>
          );
        })}
      </div>

      {/* Standings */}
      <section aria-labelledby="wfdf-standings-heading">
        <h2
          id="wfdf-standings-heading"
          className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted font-tight mb-3 pb-2 border-b border-hairline"
        >
          Final Standings · {activeDiv}
        </h2>
        <div className="rounded-lg border border-border bg-surface overflow-hidden">
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
                    'no-underline transition-colors duration-150 hover:bg-[rgb(var(--surface-hi))]',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent',
                    i > 0 ? 'border-t border-hairline' : '',
                  ].join(' ')}
                >
                  <span
                    className={[
                      'font-tight text-[13px] font-bold tabular',
                      (t.finalStanding ?? 99) <= 3 ? 'text-accent' : 'text-faint',
                    ].join(' ')}
                  >
                    {t.finalStanding ?? '—'}
                  </span>
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
      </section>

      {/* Bracket games */}
      {bracketGames.length > 0 && (
        <GameSection heading="Bracket" games={bracketGames} />
      )}

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
    <div className="rounded-md border border-hairline bg-surface px-3 py-2.5">
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

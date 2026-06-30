'use client';

// Shared event-detail body: pools + brackets for one USAU tournament.
// Used by /usau/events/[slug] and the /scores?league=usau view, which
// renders the most-recent club tournament with this same UI.
//
// Gender filter:
// The page reads the global `?div=men|women|mixed` URL param (managed by
// the top-of-page UsauDivisionSelect dropdown) and filters the entire
// view — pools, pool games, bracket tree, and bracket-play list — to that
// division. Each gender's bracket is independent, so showing both at once
// would mix unrelated games into the same pool cards.
//
// Single-division events (regional sectionals, regular-season tournaments)
// auto-fall-back to their available division so the URL filter doesn't
// accidentally hide everything.

import { useMemo } from 'react';
import Link from 'next/link';
import type { UsauEventSummary } from '@/lib/usau/data';
import { useDivision } from '@/lib/use-division';
import { UsauBracketTree, isChampionshipBracket } from './usau-bracket-tree';
import { UsauTeamLogo } from '@/components/usau/usau-team-logo';

type Game = UsauEventSummary['games'][number];
type Team = UsauEventSummary['teams'][number];

interface Props {
  event: UsauEventSummary;
}

export function UsauEventDetail({ event }: Props) {
  // ── Detect available genders ──────────────────────────────────────────
  const availableGenders = useMemo(() => {
    const set = new Set<string>();
    for (const t of event.teams) {
      if (t.genderDivision) set.add(t.genderDivision);
    }
    return Array.from(set);
  }, [event.teams]);

  // Source of truth: the global ?div URL param, set by the
  // UsauDivisionSelect dropdown at the top of the page.
  const [division] = useDivision();

  // Decide the active gender filter:
  //   - If the event has the URL-selected gender, use it.
  //   - Otherwise fall back to the event's only/first gender so we don't
  //     hide all content (e.g. ?div=men on a Women's-only sectional).
  const gender =
    availableGenders.includes(division)
      ? division
      : (availableGenders[0] ?? '');

  // ── Filter teams + games by gender ────────────────────────────────────
  // Filter to teams whose gender_division matches, then keep only games
  // where at least one participant is in the filtered set. Pool play
  // assignment lives on event_teams (with team.gender), so this approach
  // cleanly partitions pools per gender. For single-gender events the
  // filter is a no-op (every team passes).
  const { teams, games } = useMemo(() => {
    if (!gender) return { teams: event.teams, games: event.games };

    const teamIds = new Set(
      event.teams.filter((t) => t.genderDivision === gender).map((t) => t.teamId),
    );
    const filteredTeams = event.teams.filter((t) => t.genderDivision === gender);
    const filteredGames = event.games.filter(
      (g) =>
        (g.teamAId && teamIds.has(g.teamAId)) ||
        (g.teamBId && teamIds.has(g.teamBId)),
    );
    return { teams: filteredTeams, games: filteredGames };
  }, [event.teams, event.games, gender]);

  // ── Pools (from filtered teams) ───────────────────────────────────────
  let pools: Array<{ name: string; teams: Team[] }> = [];
  const teamsByPool = new Map<string, Team[]>();
  for (const t of teams) {
    if (!t.pool) continue;
    if (!teamsByPool.has(t.pool)) teamsByPool.set(t.pool, []);
    teamsByPool.get(t.pool)!.push(t);
  }
  if (teamsByPool.size > 0) {
    pools = Array.from(teamsByPool.entries())
      .map(([name, ts]) => ({
        name,
        teams: ts.slice().sort((a, b) => (a.seed ?? 99) - (b.seed ?? 99)),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } else {
    // Derive pools from games whose bracket_name starts with "Pool ".
    const poolTeamIds = new Map<string, Set<string>>();
    for (const g of games) {
      if (!g.bracketName?.toLowerCase().startsWith('pool')) continue;
      if (!poolTeamIds.has(g.bracketName)) poolTeamIds.set(g.bracketName, new Set());
      if (g.teamAId) poolTeamIds.get(g.bracketName)!.add(g.teamAId);
      if (g.teamBId) poolTeamIds.get(g.bracketName)!.add(g.teamBId);
    }
    const teamById = new Map(teams.map((t) => [t.teamId, t] as const));
    pools = Array.from(poolTeamIds.entries())
      .map(([name, ids]) => ({
        name,
        teams: Array.from(ids)
          .map((id) => teamById.get(id))
          .filter((t): t is Team => !!t)
          .sort((a, b) => (a.seed ?? 99) - (b.seed ?? 99)),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  // ── Placement brackets (filtered games) ───────────────────────────────
  // The championship bracket ("1st Place") is rendered as the visual tree
  // above, so skip it here. What's left is placement: 13th-place ties,
  // 17th-place ties, etc. These don't fit a tree visualization (they're
  // tie-break round-robins), so we keep them as a flat list.
  const bracketKey = (g: Game) => g.bracketName ?? 'Bracket';
  const byBracket = new Map<string, Game[]>();
  for (const g of games) {
    if (g.bracketName?.toLowerCase().startsWith('pool')) continue;
    if (isChampionshipBracket(g)) continue;
    const k = bracketKey(g);
    if (!byBracket.has(k)) byBracket.set(k, []);
    byBracket.get(k)!.push(g);
  }
  const placementBrackets = Array.from(byBracket.entries())
    .map(([name, gs]) => ({
      name,
      games: gs.slice().sort((a, b) => roundOrder(a.round) - roundOrder(b.round)),
    }))
    .sort((a, b) => bracketOrder(a.name) - bracketOrder(b.name));

  // ── Pool play games ───────────────────────────────────────────────────
  const poolGames = new Map<string, Game[]>();
  for (const g of games) {
    if (!g.bracketName?.toLowerCase().startsWith('pool')) continue;
    if (!poolGames.has(g.bracketName)) poolGames.set(g.bracketName, []);
    poolGames.get(g.bracketName)!.push(g);
  }

  return (
    <>
      {/* Championship bracket tree — visual left→right flow. Renders only
          when there are 1st-place bracket games to show. Receives the
          already-filtered games (filtered by the global ?div URL param). */}
      <UsauBracketTree games={games} teams={teams} />

      {pools.length > 0 && (
        <section className="mb-10" aria-labelledby="pools-heading">
          <h2
            id="pools-heading"
            className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted mb-4 font-tight"
          >
            Pool play
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            {pools.map((pool) => (
              <PoolCard key={pool.name} pool={pool} />
            ))}
          </div>
          {poolGames.size > 0 ? (
            <div className="flex flex-col gap-5">
              {Array.from(poolGames.entries())
                .sort((a, b) => a[0].localeCompare(b[0]))
                .map(([poolName, gs]) => (
                  <div key={poolName}>
                    <div className="text-[10px] font-bold tracking-[0.18em] uppercase text-faint font-tight mb-2">
                      {poolName} games
                    </div>
                    <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {gs.map((g) => (
                        <GameRow key={g.id} game={g} />
                      ))}
                    </ul>
                  </div>
                ))}
            </div>
          ) : (
            <PoolGamesEmpty slug={event.slug} />
          )}
        </section>
      )}

      {placementBrackets.length > 0 && (
        <section aria-labelledby="placement-heading">
          <h2
            id="placement-heading"
            className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted mb-4 font-tight"
          >
            Placement
          </h2>
          <div className="flex flex-col gap-7">
            {placementBrackets.map((bracket) => (
              <BracketBlock key={bracket.name} bracket={bracket} />
            ))}
          </div>
        </section>
      )}

      {pools.length === 0 && placementBrackets.length === 0 && games.length === 0 && (
        <div className="text-[12px] text-faint font-tight">
          No pool or bracket data scraped for this event yet.
        </div>
      )}
    </>
  );
}

function PoolGamesEmpty({ slug }: { slug: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-md border border-dashed border-border bg-surface">
      <span className="text-[11px] font-tight text-muted">
        Pool play games not available in our data — likely scored before our
        scraper picked up this event.
      </span>
      <a
        href={`https://play.usaultimate.org/events/${slug}/`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-[0.14em] uppercase font-tight text-accent hover:underline whitespace-nowrap no-underline"
      >
        View on USAU
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="M4 2h6v6M10 2L4 8M2 4v6h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </a>
    </div>
  );
}

function PoolCard({ pool }: { pool: { name: string; teams: Team[] } }) {
  return (
    <div className="bg-surface border border-border rounded-md overflow-hidden">
      <div className="px-3 py-2 border-b border-hairline">
        <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-ink font-tight">
          {pool.name}
        </span>
      </div>
      <ul>
        {pool.teams.map((t) => (
          <li key={t.teamId} className="border-b border-hairline last:border-b-0">
            <Link
              href={`/usau/teams/${t.teamId}`}
              className="flex items-center gap-3 px-3 py-2 hover:bg-surface-hi transition-colors no-underline"
            >
              <span className="tabular text-[11px] font-bold text-faint font-tight w-5 text-right flex-shrink-0">
                {t.seed ?? '—'}
              </span>
              <UsauTeamLogo name={t.teamName} genderDivision={t.genderDivision} size={20} />
              <span className="flex-1 min-w-0 text-[13px] font-semibold text-ink font-tight truncate">
                {t.teamName}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BracketBlock({ bracket }: { bracket: { name: string; games: Game[] } }) {
  const byRound = new Map<string, Game[]>();
  for (const g of bracket.games) {
    if (!byRound.has(g.round)) byRound.set(g.round, []);
    byRound.get(g.round)!.push(g);
  }
  const rounds = Array.from(byRound.entries()).sort(
    (a, b) => roundOrder(a[0]) - roundOrder(b[0]),
  );

  return (
    <div>
      <h3 className="font-display italic font-bold text-[22px] leading-tight tracking-[-0.02em] text-ink mb-3">
        {bracket.name}
      </h3>
      <div className="flex flex-col gap-4">
        {rounds.map(([round, games]) => (
          <div key={round}>
            <div className="text-[10px] font-bold tracking-[0.18em] uppercase text-faint font-tight mb-2">
              {prettyRound(round)}
            </div>
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {games.map((g) => (
                <GameRow key={g.id} game={g} />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function GameRow({ game }: { game: Game }) {
  const aWon =
    game.scoreA != null && game.scoreB != null && game.scoreA > game.scoreB;
  const bWon =
    game.scoreA != null && game.scoreB != null && game.scoreB > game.scoreA;

  return (
    <li className="bg-surface border border-border rounded-md p-3">
      <div className="flex items-center justify-between mb-2 text-[10px] font-bold tracking-[0.14em] uppercase font-tight">
        {game.location ? (
          <span className="text-muted">Field {game.location}</span>
        ) : (
          <span className="text-faint">—</span>
        )}
        <span className={game.status === 'final' ? 'text-accent' : 'text-muted'}>
          {game.status}
        </span>
      </div>
      <TeamLine
        name={game.teamAName}
        seed={game.seedA}
        teamId={game.teamAId}
        score={game.scoreA}
        won={aWon}
        lost={bWon}
      />
      <TeamLine
        name={game.teamBName}
        seed={game.seedB}
        teamId={game.teamBId}
        score={game.scoreB}
        won={bWon}
        lost={aWon}
      />
    </li>
  );
}

function TeamLine({
  name,
  seed,
  teamId,
  score,
  won,
  lost,
}: {
  name: string | null;
  seed: number | null;
  teamId: string | null;
  score: number | null;
  won: boolean;
  lost: boolean;
}) {
  const inner = (
    <span
      className={[
        'flex items-center gap-2 flex-1 min-w-0',
        won ? 'text-ink font-bold' : lost ? 'text-faint' : 'text-muted',
      ].join(' ')}
    >
      {seed != null && (
        <span className="tabular text-[10px] text-faint font-bold w-4 text-right">
          {seed}
        </span>
      )}
      <span className="text-[13px] font-tight truncate">{name ?? '—'}</span>
    </span>
  );

  return (
    <div className="flex items-center gap-3 py-1">
      {teamId ? (
        <Link
          href={`/usau/teams/${teamId}`}
          className="flex-1 min-w-0 hover:text-accent transition-colors no-underline"
        >
          {inner}
        </Link>
      ) : (
        <span className="flex-1 min-w-0">{inner}</span>
      )}
      <span
        className={[
          'tabular text-[16px] font-bold font-tight leading-none w-8 text-right',
          won ? 'text-ink' : lost ? 'text-faint' : 'text-muted',
        ].join(' ')}
      >
        {score ?? '—'}
      </span>
    </div>
  );
}

function roundOrder(round: string): number {
  switch (round) {
    case 'final':
      return 5;
    case 'semi':
      return 4;
    case 'quarter':
      return 3;
    case 'prequarter':
      return 2;
    case 'placement':
    case 'consolation':
      return 6;
    default:
      return 1;
  }
}

function prettyRound(round: string): string {
  switch (round) {
    case 'final':
      return 'Final';
    case 'semi':
      return 'Semifinals';
    case 'quarter':
      return 'Quarterfinals';
    case 'prequarter':
      return 'Prequarters';
    case 'placement':
      return 'Placement';
    case 'consolation':
      return 'Consolation';
    case 'pool':
      return 'Pool';
    default:
      return round;
  }
}

function bracketOrder(name: string): number {
  const t = name.toLowerCase();
  if (t.includes('championship')) return 0;
  if (t.includes('third')) return 1;
  if (t.includes('fifth')) return 2;
  if (t.includes('seventh')) return 3;
  if (t.includes('ninth')) return 4;
  return 10;
}

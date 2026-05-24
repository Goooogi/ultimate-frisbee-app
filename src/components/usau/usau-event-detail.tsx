// Shared event-detail body: pools + brackets for one USAU tournament.
// Used by /usau/events/[slug] and the /scores?league=usau view, which
// renders the most-recent club tournament with this same UI.

import Link from 'next/link';
import type { UsauEventSummary } from '@/lib/usau/data';
import { UsauBracketTree } from './usau-bracket-tree';

interface Props {
  event: UsauEventSummary;
}

export function UsauEventDetail({ event }: Props) {
  // Pools sourced from event_teams.pool first; if empty, fall back to
  // bracket_name="Pool X" on games. Our ingest stores pool info on games
  // rather than participations, so this fallback is the common path.
  let pools: Array<{ name: string; teams: UsauEventSummary['teams'] }> = [];
  const teamsByPool = new Map<string, UsauEventSummary['teams']>();
  for (const t of event.teams) {
    if (!t.pool) continue;
    if (!teamsByPool.has(t.pool)) teamsByPool.set(t.pool, []);
    teamsByPool.get(t.pool)!.push(t);
  }
  if (teamsByPool.size > 0) {
    pools = Array.from(teamsByPool.entries())
      .map(([name, teams]) => ({
        name,
        teams: teams.slice().sort((a, b) => (a.seed ?? 99) - (b.seed ?? 99)),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } else {
    // Derive pools from games whose bracket_name starts with "Pool ".
    const poolTeamIds = new Map<string, Set<string>>();
    for (const g of event.games) {
      if (!g.bracketName?.toLowerCase().startsWith('pool')) continue;
      if (!poolTeamIds.has(g.bracketName)) poolTeamIds.set(g.bracketName, new Set());
      if (g.teamAId) poolTeamIds.get(g.bracketName)!.add(g.teamAId);
      if (g.teamBId) poolTeamIds.get(g.bracketName)!.add(g.teamBId);
    }
    const teamById = new Map(event.teams.map((t) => [t.teamId, t] as const));
    pools = Array.from(poolTeamIds.entries())
      .map(([name, ids]) => ({
        name,
        teams: Array.from(ids)
          .map((id) => teamById.get(id))
          .filter((t): t is UsauEventSummary['teams'][number] => !!t)
          .sort((a, b) => (a.seed ?? 99) - (b.seed ?? 99)),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  // Bracket view: games grouped by bracket_name, skipping "Pool X" since
  // they show up above.
  const bracketKey = (g: UsauEventSummary['games'][number]) =>
    g.bracketName ?? 'Bracket';
  const byBracket = new Map<string, UsauEventSummary['games']>();
  for (const g of event.games) {
    if (g.bracketName?.toLowerCase().startsWith('pool')) continue;
    const k = bracketKey(g);
    if (!byBracket.has(k)) byBracket.set(k, []);
    byBracket.get(k)!.push(g);
  }
  const brackets = Array.from(byBracket.entries())
    .map(([name, games]) => ({
      name,
      games: games.slice().sort((a, b) => roundOrder(a.round) - roundOrder(b.round)),
    }))
    .sort((a, b) => bracketOrder(a.name) - bracketOrder(b.name));

  // Pool-play games, grouped by pool name, for the pool-play games section.
  const poolGames = new Map<string, UsauEventSummary['games']>();
  for (const g of event.games) {
    if (!g.bracketName?.toLowerCase().startsWith('pool')) continue;
    if (!poolGames.has(g.bracketName)) poolGames.set(g.bracketName, []);
    poolGames.get(g.bracketName)!.push(g);
  }

  return (
    <>
      {/* Championship bracket tree — visual left→right flow. Renders only
          when there are 1st-place bracket games to show. */}
      <UsauBracketTree event={event} />

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
          {poolGames.size > 0 && (
            <div className="flex flex-col gap-5">
              {Array.from(poolGames.entries())
                .sort((a, b) => a[0].localeCompare(b[0]))
                .map(([poolName, games]) => (
                  <div key={poolName}>
                    <div className="text-[10px] font-bold tracking-[0.18em] uppercase text-faint font-tight mb-2">
                      {poolName} games
                    </div>
                    <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {games.map((g) => (
                        <GameRow key={g.id} game={g} />
                      ))}
                    </ul>
                  </div>
                ))}
            </div>
          )}
        </section>
      )}

      {brackets.length > 0 && (
        <section aria-labelledby="brackets-heading">
          <h2
            id="brackets-heading"
            className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted mb-4 font-tight"
          >
            Bracket play
          </h2>
          <div className="flex flex-col gap-7">
            {brackets.map((bracket) => (
              <BracketBlock key={bracket.name} bracket={bracket} />
            ))}
          </div>
        </section>
      )}

      {pools.length === 0 && brackets.length === 0 && (
        <div className="text-[12px] text-faint font-tight">
          No pool or bracket data scraped for this event yet.
        </div>
      )}
    </>
  );
}

function PoolCard({
  pool,
}: {
  pool: { name: string; teams: UsauEventSummary['teams'] };
}) {
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
              <span className="tabular text-[11px] font-bold text-faint font-tight w-5 text-right">
                {t.seed ?? '—'}
              </span>
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

function BracketBlock({
  bracket,
}: {
  bracket: { name: string; games: UsauEventSummary['games'] };
}) {
  const byRound = new Map<string, UsauEventSummary['games']>();
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

function GameRow({ game }: { game: UsauEventSummary['games'][number] }) {
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
        <span
          className={game.status === 'final' ? 'text-accent' : 'text-muted'}
        >
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

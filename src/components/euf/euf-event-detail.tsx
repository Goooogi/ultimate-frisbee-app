'use client';

// EUF event detail — division tabs → standings + games for one EUCS event.
//
// EUCS has a fixed 3-division vocabulary (Open / Women's / Mixed), so pill tabs
// are right here rather than a dropdown (the 5+ rule doesn't apply).
//
// Standings are DERIVED from games (get_euf_standings): Ultiorganizer publishes
// no team records or final placements, so ranking is win% → point diff.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { EufDivision, EufGameCard, EufStandingRow } from '@/lib/euf/data';
import { EufFlag } from './euf-flag';
import { EufBracketTree, hasEufBracket } from './euf-bracket-tree';

interface Props {
  divisions: EufDivision[];
  standings: EufStandingRow[];
  games: EufGameCard[];
}

// Bracket rounds read best latest-first (final at the top); pools read as-is.
const STAGE_ORDER: Record<string, number> = {
  final: 0,
  semifinal: 1,
  quarterfinal: 2,
  bracket: 3,
  crossover: 4,
  placement: 5,
  pool: 6,
  other: 7,
};

export function EufEventDetail({ divisions, standings, games }: Props) {
  const [activeDiv, setActiveDiv] = useState<EufDivision>(divisions[0] ?? 'Open');

  const divStandings = useMemo(
    () => standings.filter((s) => s.division === activeDiv),
    [standings, activeDiv],
  );

  const divGames = useMemo(() => games.filter((g) => g.division === activeDiv), [games, activeDiv]);
  const showTree = useMemo(() => hasEufBracket(divGames), [divGames]);

  // Placement labels on the bracket cards come from the STORED final_placement
  // (see euf-bracket-tree.tsx) — the standings rows already carry it.
  const placements = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of divStandings) if (s.finalPlacement != null) m.set(s.teamId, s.finalPlacement);
    return m;
  }, [divStandings]);

  // Group games by their round label, ordered by stage then label. Bracket
  // rounds are excluded when the tree renders them, so they aren't listed twice.
  const grouped = useMemo(() => {
    const mine = divGames.filter((g) => !showTree || !/^Bracket \d+-\d+/.test(g.roundName ?? ''));
    const byRound = new Map<string, EufGameCard[]>();
    for (const g of mine) {
      const k = g.roundName ?? 'Games';
      if (!byRound.has(k)) byRound.set(k, []);
      byRound.get(k)!.push(g);
    }
    return [...byRound.entries()].sort((a, b) => {
      const sa = STAGE_ORDER[a[1][0]?.stage ?? 'other'] ?? 9;
      const sb = STAGE_ORDER[b[1][0]?.stage ?? 'other'] ?? 9;
      return sa !== sb ? sa - sb : a[0].localeCompare(b[0]);
    });
  }, [divGames, showTree]);

  return (
    <div className="flex flex-col gap-6">
      {/* Division tabs */}
      {divisions.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {divisions.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setActiveDiv(d)}
              aria-pressed={d === activeDiv}
              className={[
                'px-3 py-1.5 rounded-full text-[11px] font-bold tracking-[0.06em] uppercase font-tight',
                'transition-colors cursor-pointer border',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                d === activeDiv
                  ? 'bg-ink text-surface border-ink'
                  : 'bg-transparent text-muted border-hairline hover:text-ink',
              ].join(' ')}
            >
              {d}
            </button>
          ))}
        </div>
      )}

      {/* Standings */}
      <section>
        <h2 className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted font-tight pb-2 border-b border-hairline">
          Standings
        </h2>
        {divStandings.length === 0 ? (
          <p className="text-muted font-tight text-[13px] py-4">No standings available.</p>
        ) : (
          <div className="overflow-x-auto">
            {/* No min-width: W/L/Diff are narrow enough to fit a 390px phone
                without horizontal scroll, which is where most of this is read. */}
            <table className="w-full border-collapse">
              <thead>
                <tr className="text-[10px] font-bold tracking-[0.12em] uppercase text-muted font-tight">
                  <th className="text-right py-2 pr-2 font-bold w-8">#</th>
                  <th className="text-left py-2 pr-2 font-bold">Team</th>
                  <th className="text-right py-2 px-2 font-bold">W</th>
                  <th className="text-right py-2 px-2 font-bold">L</th>
                  <th className="text-right py-2 pl-2 font-bold">Diff</th>
                </tr>
              </thead>
              <tbody>
                {divStandings.map((s) => (
                  <tr key={s.teamId} className="border-t border-hairline">
                    <td className="text-right py-2 pr-2 text-[12px] font-tight tabular-nums text-muted">
                      {s.finalPlacement ?? ''}
                    </td>
                    <td className="py-2 pr-2">
                      <Link
                        href={`/euf/teams/${s.teamId}`}
                        className="inline-flex items-center gap-2 no-underline hover:underline text-ink font-tight text-[13px]"
                      >
                        <EufFlag countryName={s.countryName} size={14} />
                        <span className="truncate">{s.teamName}</span>
                      </Link>
                    </td>
                    <td className="text-right py-2 px-2 font-tight text-[13px] text-ink tabular-nums">
                      {s.wins}
                    </td>
                    <td className="text-right py-2 px-2 font-tight text-[13px] text-muted tabular-nums">
                      {s.losses}
                    </td>
                    <td className="text-right py-2 pl-2 font-tight text-[13px] text-muted tabular-nums">
                      {s.pointDiff > 0 ? `+${s.pointDiff}` : s.pointDiff}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Bracket tree — EUCS "Finals" is 4 simultaneous placement games, so the
          tree labels which places each one decides. */}
      {showTree && <EufBracketTree games={divGames} placements={placements} />}

      {/* Remaining rounds (pools, crossovers) as flat lists */}
      {grouped.map(([round, list]) => (
        <section key={round}>
          <h2 className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted font-tight pb-2 border-b border-hairline">
            {round}
          </h2>
          <ul className="list-none p-0 m-0">
            {list.map((g) => {
              const homeWon = (g.homeScore ?? 0) > (g.awayScore ?? 0);
              return (
                <li
                  key={g.id}
                  className="flex items-center gap-2 py-2 border-t border-hairline first:border-t-0"
                >
                  <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                    <TeamLine
                      id={g.homeTeamId}
                      name={g.homeName}
                      country={g.homeCountry}
                      score={g.homeScore}
                      won={homeWon}
                    />
                    <TeamLine
                      id={g.awayTeamId}
                      name={g.awayName}
                      country={g.awayCountry}
                      score={g.awayScore}
                      won={!homeWon}
                    />
                  </div>
                  {g.status === 'forfeit' && (
                    <span className="text-[9px] font-bold tracking-[0.1em] uppercase text-muted font-tight flex-shrink-0">
                      FF
                    </span>
                  )}
                  {/* Box score lives on the game page. The team names inside
                      TeamLine are their own links, so this is a separate
                      affordance rather than wrapping the whole row. */}
                  <Link
                    href={`/euf/g/${g.id}`}
                    aria-label={`Box score: ${g.homeName} vs ${g.awayName}`}
                    className="text-[10px] font-bold tracking-[0.1em] uppercase text-muted font-tight flex-shrink-0 no-underline hover:text-accent transition-colors"
                  >
                    Box
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function TeamLine({
  id,
  name,
  country,
  score,
  won,
}: {
  id: string | null;
  name: string;
  country: string | null;
  score: number | null;
  won: boolean;
}) {
  const inner = (
    <>
      <EufFlag countryName={country} size={13} />
      <span className={['truncate', won ? 'text-ink font-semibold' : 'text-muted'].join(' ')}>
        {name}
      </span>
    </>
  );
  return (
    <div className="flex items-center gap-2 text-[13px] font-tight">
      {id ? (
        <Link
          href={`/euf/teams/${id}`}
          className="flex items-center gap-2 min-w-0 flex-1 no-underline hover:underline"
        >
          {inner}
        </Link>
      ) : (
        <span className="flex items-center gap-2 min-w-0 flex-1">{inner}</span>
      )}
      <span
        className={[
          'tabular-nums flex-shrink-0',
          won ? 'text-ink font-bold' : 'text-muted',
        ].join(' ')}
      >
        {score ?? '–'}
      </span>
    </div>
  );
}

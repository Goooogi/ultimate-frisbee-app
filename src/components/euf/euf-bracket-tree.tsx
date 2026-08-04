'use client';

// EUF bracket tree — renders one bracket group (e.g. "Bracket 1-8") as its
// rounds, left to right: quarters → semis → finals.
//
// EUCS brackets are PLACEMENT brackets: the "Finals" round is four simultaneous
// games deciding 1st/3rd/5th/7th, not a single title game. So we label each
// final with the places it awards rather than calling them all "Final".
//
// Those labels come from the STORED euf_teams.final_placement (derived once by
// derive_euf_placements() in SQL) — this component does NOT re-derive them.
// An earlier version mirrored the SQL ordering rule here; that's the same
// TS-vs-SQL drift footgun as the 12-0 scoring mirror, and it can silently
// disagree with the standings table on the same page. Reading the stored value
// means a not-yet-derived event renders an unlabelled card instead of a
// confidently wrong one.

import Link from 'next/link';
import type { EufGameCard } from '@/lib/euf/data';
import { bracketBucket, ordinal as sharedOrdinal } from '@/lib/bracket-tree';
import { EufFlag } from './euf-flag';

/** "Bracket 1-8 Semifinals" → "Bracket 1-8"
 *
 *  Upstream writes the bracket range on EITHER side of the word: the tour stops
 *  use "Bracket 1-8 Finals" while EUCF 2023 uses "1-16 Bracket Finals". Only the
 *  prefix form was matched before, so EUCF 2023's 44 bracket games — the whole
 *  championship — fell through to the flat round lists and never drew a tree.
 *  Both shapes normalize to the same "Bracket {lo}-{hi}" key so bracketBucket()
 *  labels them identically. */
function bracketOf(roundName: string | null): string | null {
  if (!roundName) return null;
  const stripped = roundName.replace(/\s+(Quarterfinals|Semifinals|Finals)$/, '');
  const prefix = stripped.match(/^Bracket (\d+)-(\d+)$/);
  if (prefix) return `Bracket ${prefix[1]}-${prefix[2]}`;
  const suffix = stripped.match(/^(\d+)-(\d+) Bracket$/);
  if (suffix) return `Bracket ${suffix[1]}-${suffix[2]}`;
  return null;
}

/** Column index within a bracket. EUCF 2023 adds an explicit Quarterfinals
 *  round, so the tree is up to 3 columns of play plus the placement finals. */
function depthOf(roundName: string | null): number {
  if (!roundName) return 1;
  if (/Quarterfinals$/.test(roundName)) return 1;
  if (/Semifinals$/.test(roundName)) return 2;
  if (/Finals$/.test(roundName)) return 3;
  return 1;
}

const ORDINAL = sharedOrdinal;

export function hasEufBracket(games: EufGameCard[]): boolean {
  return games.some((g) => bracketOf(g.roundName));
}

/** teamId → final_placement, from the standings rows. */
export type PlacementMap = ReadonlyMap<string, number>;

export function EufBracketTree({
  games,
  placements,
}: {
  games: EufGameCard[];
  placements: PlacementMap;
}) {
  const bracketGames = games.filter((g) => bracketOf(g.roundName));
  if (!bracketGames.length) return null;

  // Group into brackets ("Bracket 1-8", "Bracket 9-16"), each with its rounds.
  const brackets = new Map<string, EufGameCard[]>();
  for (const g of bracketGames) {
    const b = bracketOf(g.roundName)!;
    if (!brackets.has(b)) brackets.set(b, []);
    brackets.get(b)!.push(g);
  }

  const ordered = [...brackets.entries()].sort((a, b) => {
    const la = Number(a[0].match(/(\d+)-/)?.[1] ?? 99);
    const lb = Number(b[0].match(/(\d+)-/)?.[1] ?? 99);
    return la - lb;
  });

  return (
    <div className="flex flex-col gap-6">
      {ordered.map(([name, list]) => (
        <BracketGroup key={name} name={name} games={list} placements={placements} />
      ))}
    </div>
  );
}

function BracketGroup({
  name,
  games,
  placements,
}: {
  name: string;
  games: EufGameCard[];
  placements: PlacementMap;
}) {
  const rounds = [1, 2, 3]
    .map((d) => ({ depth: d, games: games.filter((g) => depthOf(g.roundName) === d) }))
    .filter((r) => r.games.length > 0);

  // A placement game's places ARE its two teams' stored placements. Sorting the
  // finals by the better of the two puts the gold game first, 3rd/4th next, and
  // so on — no re-derivation, and it stays correct if the SQL rule ever changes.
  const placesOf = (g: EufGameCard): [number, number] | null => {
    const h = g.homeTeamId ? placements.get(g.homeTeamId) : undefined;
    const a = g.awayTeamId ? placements.get(g.awayTeamId) : undefined;
    if (h == null || a == null) return null;
    return h < a ? [h, a] : [a, h];
  };

  return (
    <section>
      <h3 className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted font-tight pb-2 border-b border-hairline">
        {bracketBucket(name).label}
      </h3>
      <div className="flex gap-4 overflow-x-auto pt-3">
        {rounds.map((r) => {
          const isFinals = r.depth === 3;
          const list = isFinals
            ? [...r.games].sort(
                (a, b) => (placesOf(a)?.[0] ?? 99) - (placesOf(b)?.[0] ?? 99),
              )
            : r.games;

          return (
            <div key={r.depth} className="flex flex-col gap-2 min-w-[220px] flex-1">
              <p className="text-[9px] font-bold tracking-[0.14em] uppercase text-faint font-tight">
                {r.depth === 1 ? 'Quarterfinals' : r.depth === 2 ? 'Semifinals' : 'Placement'}
              </p>
              {list.map((g) => {
                const places = placesOf(g);
                return (
                  <div key={g.id} className="rounded-card bg-surface shadow-card p-2.5">
                    {isFinals && places && (
                      <p className="text-[9px] font-bold tracking-[0.1em] uppercase text-accent font-tight mb-1">
                        {ORDINAL(places[0])} / {ORDINAL(places[1])} place
                      </p>
                    )}
                    <BracketSide
                      id={g.homeTeamId}
                      name={g.homeName}
                      country={g.homeCountry}
                      score={g.homeScore}
                      won={(g.homeScore ?? 0) > (g.awayScore ?? 0)}
                    />
                    <BracketSide
                      id={g.awayTeamId}
                      name={g.awayName}
                      country={g.awayCountry}
                      score={g.awayScore}
                      won={(g.awayScore ?? 0) > (g.homeScore ?? 0)}
                    />
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function BracketSide({
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
  const body = (
    <>
      <EufFlag countryName={country} size={12} />
      <span className={['truncate', won ? 'text-ink font-semibold' : 'text-muted'].join(' ')}>
        {name}
      </span>
    </>
  );
  return (
    <div className="flex items-center gap-1.5 text-[12px] font-tight py-0.5">
      {id ? (
        <Link
          href={`/euf/teams/${id}`}
          className="flex items-center gap-1.5 min-w-0 flex-1 no-underline hover:underline"
        >
          {body}
        </Link>
      ) : (
        <span className="flex items-center gap-1.5 min-w-0 flex-1">{body}</span>
      )}
      <span
        className={['tabular-nums flex-shrink-0', won ? 'text-ink font-bold' : 'text-muted'].join(' ')}
      >
        {score ?? '–'}
      </span>
    </div>
  );
}
